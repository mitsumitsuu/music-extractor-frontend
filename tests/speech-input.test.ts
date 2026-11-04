import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechInputSession, appendSpeechText, getSpeechRecognitionConstructor, type SpeechInputCallbacks, type SpeechRecognitionEventLike, type SpeechRecognitionLike } from "@/lib/speech-input";

describe("appendSpeechText", () => {
  it("既存の入力を保ったまま改行で追記", () => {
    expect(appendSpeechText("", "千本桜")).toBe("千本桜");
    expect(appendSpeechText("千本桜", "ロキ")).toBe("千本桜\nロキ");
    expect(appendSpeechText("千本桜\n", "ロキ")).toBe("千本桜\nロキ");
  });
  it("空・空白だけの発話は何も足さない", () => {
    expect(appendSpeechText("abc", "   ")).toBe("abc");
    expect(appendSpeechText("", "")).toBe("");
  });
});

describe("getSpeechRecognitionConstructor", () => {
  it("標準版を優先し、webkit 版にフォールバック。未対応や不正な環境は undefined", () => {
    const std = function () {}, wk = function () {};
    expect(getSpeechRecognitionConstructor({ SpeechRecognition: std, webkitSpeechRecognition: wk })).toBe(std);
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: wk })).toBe(wk);
    expect(getSpeechRecognitionConstructor({})).toBeUndefined();
    expect(getSpeechRecognitionConstructor(null)).toBeUndefined();
    expect(getSpeechRecognitionConstructor("x")).toBeUndefined();
  });
});

class FakeRecognition implements SpeechRecognitionLike {
  lang = ""; continuous = false; interimResults = false; maxAlternatives = 0;
  onstart: (() => void) | null = null; onend: (() => void) | null = null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null = null; onerror: ((e: { error: string }) => void) | null = null;
  started = false; stopped = false; aborted = false;
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
}

const result = (items: { text: string; final: boolean }[], resultIndex = 0): SpeechRecognitionEventLike => ({
  resultIndex,
  results: Object.assign(items.map((i) => Object.assign([{ transcript: i.text }], { isFinal: i.final })), { length: items.length }) as never,
});

describe("SpeechInputSession", () => {
  let rec: FakeRecognition;
  let cb: { [K in keyof SpeechInputCallbacks]: ReturnType<typeof vi.fn> };
  let session: SpeechInputSession;
  beforeEach(() => {
    vi.useFakeTimers();
    rec = new FakeRecognition();
    cb = { onState: vi.fn(), onFinalText: vi.fn(), onInterimText: vi.fn(), onError: vi.fn() };
    session = new SpeechInputSession(() => rec, cb as unknown as SpeechInputCallbacks, { startTimeoutMs: 1000, stopTimeoutMs: 500 });
  });
  afterEach(() => vi.useRealTimers());

  it("開始 → 認識中 → 確定した発話だけを1回ずつ通知 → 停止", () => {
    expect(session.start()).toBe(true);
    expect(rec).toMatchObject({ started: true, lang: "ja-JP", continuous: true, interimResults: true });
    rec.onstart?.();
    expect(session.state).toBe("listening");
    rec.onresult?.(result([{ text: "千本", final: false }]));
    expect(cb.onInterimText).toHaveBeenLastCalledWith("千本");
    rec.onresult?.(result([{ text: " 千本桜 ", final: true }]));
    rec.onresult?.(result([{ text: " 千本桜 ", final: true }, { text: "ロ", final: false }])); // 同じ確定結果が再通知されても重複しない
    expect(cb.onFinalText.mock.calls).toEqual([["千本桜"]]);
    session.stop();
    expect(session.state).toBe("stopping");
    expect(rec.stopped).toBe(true);
    rec.onend?.();
    expect(session.state).toBe("idle");
  });
  it("二重開始は無視される", () => {
    expect(session.start()).toBe(true);
    expect(session.start()).toBe(false);
  });
  it("未対応ブラウザ（認識器を作れない）ではエラーを通知して開始しない", () => {
    const s = new SpeechInputSession(() => undefined, cb as unknown as SpeechInputCallbacks);
    expect(s.start()).toBe(false);
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("利用できません"));
  });
  it("マイク拒否のエラーは日本語で通知し、idle に戻る", () => {
    session.start();
    rec.onerror?.({ error: "not-allowed" });
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("マイクの使用が許可されていません"));
    expect(session.state).toBe("idle");
  });
  it("開始が確認できなければタイムアウトで中止", () => {
    session.start();
    vi.advanceTimersByTime(1001);
    expect(session.state).toBe("idle");
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("開始を確認できません"));
    expect(rec.aborted).toBe(true);
  });
  it("停止が確認できなければタイムアウトで強制終了", () => {
    session.start();
    rec.onstart?.();
    session.stop();
    vi.advanceTimersByTime(501);
    expect(session.state).toBe("idle");
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining("終了を確認できなかった"));
  });
  it("破棄後は通知しない", () => {
    session.start();
    rec.onstart?.();
    session.dispose();
    cb.onFinalText.mockClear();
    rec.onresult?.(result([{ text: "遅れて届いた", final: true }]));
    expect(cb.onFinalText).not.toHaveBeenCalled();
    expect(session.start()).toBe(false);
  });
});
