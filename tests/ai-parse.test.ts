import { describe, expect, it } from "vitest";
import { parseSongs } from "@/lib/server/ai";

describe("parseSongs（AI 応答の整形）", () => {
  const body = '{"songs":[{"title":"千本桜","producer":"黒うさP","bpm":154,"key":"Am","mmd":"あり","url":"https://youtu.be/dQw4w9WgXcQ","matchesTheme":true}]}';
  it("素の JSON / コードフェンス / 前置き・後置き付きを読める", () => {
    for (const t of [body, "```json\n" + body + "\n```", "結果は次のとおりです。\n" + body + "\n以上"]) {
      expect(parseSongs(t)).toEqual([{ title: "千本桜", producer: "黒うさP", vocal: undefined, bpm: 154, key: "Am", mmd: "あり", url: "https://youtu.be/dQw4w9WgXcQ", matchesTheme: true }]);
    }
  });
  it("曲名の無い・空白だけの・オブジェクトでない要素を捨て、前後の空白を除く", () => {
    const r = parseSongs(JSON.stringify({ songs: [null, 5, "x", {}, { title: "  " }, { title: 123 }, { title: " ロキ " }] }));
    expect(r.map((s) => s.title)).toEqual(["ロキ"]);
  });
  it("型や範囲の合わない項目を落とす（BPM / Key / MMD / URL / matchesTheme）", () => {
    const [s] = parseSongs(JSON.stringify({ songs: [{ title: "a", bpm: "150", key: 5, mmd: "Yes", url: "javascript:alert(1)", matchesTheme: "true" }] }));
    expect(s).toMatchObject({ title: "a", bpm: undefined, key: undefined, mmd: undefined, url: undefined, matchesTheme: undefined });
    expect(parseSongs('{"songs":[{"title":"a","bpm":10}]}')[0].bpm).toBeUndefined();
    expect(parseSongs('{"songs":[{"title":"a","bpm":400}]}')[0].bpm).toBeUndefined();
    expect(parseSongs('{"songs":[{"title":"a","bpm":150.6}]}')[0].bpm).toBe(151);
    expect(parseSongs('{"songs":[{"title":"a","url":"https://user:pw@example.com/"}]}')[0].url).toBeUndefined();
    expect(parseSongs('{"songs":[{"title":"a","url":"ftp://example.com/"}]}')[0].url).toBeUndefined();
  });
  it("長すぎる文字列は切り詰め、曲数は 1000 件まで", () => {
    const [s] = parseSongs(JSON.stringify({ songs: [{ title: "あ".repeat(500), producer: "p".repeat(500), key: "k".repeat(50) }] }));
    expect(s.title).toHaveLength(200);
    expect(s.producer!.length).toBeLessThanOrEqual(200);
    expect(s.key).toHaveLength(20);
    const many = Array.from({ length: 1500 }, (_, i) => ({ title: `t${i}` }));
    expect(parseSongs(JSON.stringify({ songs: many }))).toHaveLength(1000);
  });
  it("songs が無い・配列でない場合は空配列、JSON として壊れていれば例外", () => {
    expect(parseSongs("{}")).toEqual([]);
    expect(parseSongs('{"songs":"x"}')).toEqual([]);
    expect(() => parseSongs('{"songs":[{"title":')).toThrow();
    expect(() => parseSongs("")).toThrow();
  });
});
