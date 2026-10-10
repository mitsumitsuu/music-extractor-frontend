export type SpeechInputState = "idle" | "starting" | "listening" | "stopping";

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike };
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
export type SpeechRecognitionFactory = () => SpeechRecognitionLike | undefined;

export interface SpeechInputCallbacks {
  onState(state: SpeechInputState): void;
  onFinalText(text: string): void;
  onInterimText(text: string): void;
  onError(message: string): void;
}

export function getSpeechRecognitionConstructor(environment: unknown = globalThis): SpeechRecognitionConstructor | undefined {
  if (!environment || typeof environment !== "object") return undefined;
  const scope = environment as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const constructor = typeof scope.SpeechRecognition === "function" ? scope.SpeechRecognition : scope.webkitSpeechRecognition;
  return typeof constructor === "function" ? constructor as SpeechRecognitionConstructor : undefined;
}

export function appendSpeechText(current: string, utterance: string): string {
  const text = utterance.trim();
  if (!text) return current;
  return current ? `${current}${current.endsWith("\n") ? "" : "\n"}${text}` : text;
}

function errorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
    case "NotAllowedError":
    case "SecurityError":
      return "マイクの使用が許可されていません。ブラウザのマイク設定を確認してください。";
    case "no-speech":
      return "音声を聞き取れませんでした。もう一度、マイクに向かって話してください。";
    case "network":
      return "音声認識に接続できませんでした。ネット接続を確認して、もう一度お試しください。";
    case "audio-capture":
      return "マイクを使用できません。接続や、他のアプリで使用中でないかを確認してください。";
    case "not-supported":
    case "NotSupportedError":
      return "このブラウザでは音声入力を利用できません。対応するブラウザでお試しください。";
    case "language-not-supported":
      return "このブラウザでは日本語の音声入力を利用できません。";
    case "aborted":
      return "音声入力が中断されました。もう一度お試しください。";
    default:
      return "音声入力を開始できませんでした。ブラウザのマイク設定を確認して、もう一度お試しください。";
  }
}

/** 1回の開始から終了までを管理。認識結果は録音セッションごとのインデックスで重複を防ぐ。 */
export class SpeechInputSession {
  private currentState: SpeechInputState = "idle";
  private recognition: SpeechRecognitionLike | undefined;
  private generation = 0;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private interim = "";

  constructor(
    private readonly factory: SpeechRecognitionFactory,
    private readonly callbacks: SpeechInputCallbacks,
    private readonly options: { startTimeoutMs?: number; stopTimeoutMs?: number } = {},
  ) {}

  get state(): SpeechInputState { return this.currentState; }

  start(): boolean {
    if (this.disposed || this.currentState !== "idle") return false;
    let recognition: SpeechRecognitionLike | undefined;
    try { recognition = this.factory(); } catch (error) {
      this.callbacks.onError(errorMessage(error instanceof Error ? error.name : "not-supported"));
      return false;
    }
    if (!recognition) { this.callbacks.onError(errorMessage("not-supported")); return false; }

    const generation = ++this.generation;
    const active = () => !this.disposed && this.generation === generation && this.recognition === recognition;
    const finalized = new Set<number>();
    this.recognition = recognition;
    try {
      recognition.lang = "ja-JP";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        if (!active()) return;
        if (this.currentState === "starting") { this.clearTimer(); this.setState("listening"); }
      };
      recognition.onresult = (event) => {
        if (!active()) return;
        for (let index = Math.max(0, event.resultIndex); index < event.results.length; index++) {
          const result = event.results[index];
          if (!result?.isFinal || finalized.has(index)) continue;
          finalized.add(index);
          const text = result[0]?.transcript.trim();
          if (text) this.callbacks.onFinalText(text);
          if (!active()) return;
        }
        const interim: string[] = [];
        for (let index = 0; index < event.results.length; index++) {
          const result = event.results[index];
          if (!result?.isFinal && !finalized.has(index)) {
            const text = result?.[0]?.transcript.trim();
            if (text) interim.push(text);
          }
        }
        this.setInterim(interim.join(" "));
      };
      recognition.onerror = (event) => {
        if (!active()) return;
        const silent = event.error === "aborted" && this.currentState === "stopping";
        this.finish(true);
        if (!silent && !this.disposed) this.callbacks.onError(errorMessage(event.error));
      };
      recognition.onend = () => { if (active()) this.finish(false); };
      this.setState("starting");
      if (!active() || this.state !== "starting") return false;
      this.timer = setTimeout(() => {
        if (!active()) return;
        this.finish(true);
        if (!this.disposed) this.callbacks.onError("音声入力の開始を確認できませんでした。もう一度お試しください。");
      }, this.options.startTimeoutMs ?? 30_000);
      recognition.start();
      return true;
    } catch (error) {
      if (active()) {
        this.finish(true);
        if (!this.disposed) this.callbacks.onError(errorMessage(error instanceof Error ? error.name : "unknown"));
      }
      return false;
    }
  }

  stop(): void {
    const recognition = this.recognition;
    if (this.disposed || !recognition || this.currentState === "stopping") return;
    this.clearTimer();
    this.setState("stopping");
    if (this.disposed || this.recognition !== recognition) return;
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (this.disposed || this.generation !== generation) return;
      this.finish(true);
      if (!this.disposed) this.callbacks.onError("音声入力の終了を確認できなかったため停止しました。未確定の音声は追記されていません。");
    }, this.options.stopTimeoutMs ?? 8_000);
    try { recognition.stop(); } catch {
      if (this.recognition === recognition && this.generation === generation) {
        this.finish(true);
        if (!this.disposed) this.callbacks.onError("音声入力を停止できなかったため中止しました。もう一度お試しください。");
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.detach(true);
    this.currentState = "idle";
    this.interim = "";
  }

  private setState(state: SpeechInputState): void {
    if (this.currentState === state || this.disposed) return;
    this.currentState = state;
    this.callbacks.onState(state);
  }

  private setInterim(text: string): void {
    if (this.interim === text || this.disposed) return;
    this.interim = text;
    this.callbacks.onInterimText(text);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private detach(abort: boolean): void {
    const recognition = this.recognition;
    this.recognition = undefined;
    ++this.generation;
    if (!recognition) return;
    recognition.onstart = recognition.onend = recognition.onresult = recognition.onerror = null;
    if (abort) { try { recognition.abort(); } catch { /* 既に終了していても後続処理を続ける */ } }
  }

  private finish(abort: boolean): void {
    this.clearTimer();
    this.detach(abort);
    this.setInterim("");
    this.setState("idle");
  }
}
