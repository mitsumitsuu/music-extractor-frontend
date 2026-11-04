import { describe, expect, it } from "vitest";
import { appendPerformed, parsePerformed, parsePerformedLine, performedKeySet } from "@/lib/performed";
import { songKey } from "@/lib/parse";

describe("parsePerformedLine", () => {
  it.each([
    ["1. 千本桜 / 黒うさP", { title: "千本桜", producer: "黒うさP" }],
    ["・ロキ ／ みきとP", { title: "ロキ", producer: "みきとP" }],
    ["13:05 メルト / ryo 4:00 ※MCあり", { title: "メルト", producer: "ryo" }],
    ["千本桜（BPM 154）", { title: "千本桜", producer: undefined }],
    ["千本桜\t黒うさP", { title: "千本桜", producer: "黒うさP" }],
  ])("%s", (line, expected) => expect(parsePerformedLine(line)).toEqual(expected));
  it.each([[""], ["   "], ["# 見出し"], ["[MC] トーク 2:00"], ["-----"], ["・・・"]])("曲ではない行 %j は null", (line) => expect(parsePerformedLine(line)).toBeNull());
});

describe("parsePerformed / appendPerformed", () => {
  it("CRLF・CR の改行と重複（表記ゆれ）を1曲にまとめる", () => {
    const r = parsePerformed("千本桜 / 黒うさP\r\n千本桜!\r1. ロキ");
    expect(r.map((e) => e.title)).toEqual(["千本桜", "ロキ"]);
    expect(r[0].key).toBe(songKey("千本桜"));
  });
  it("空・空白だけなら空", () => {
    expect(parsePerformed("")).toEqual([]);
    expect(performedKeySet("\n\n  \n").size).toBe(0);
  });
  it("追記: 既にある曲は足さず、件数を返す。末尾に改行", () => {
    const r = appendPerformed("千本桜 / 黒うさP\n", [{ title: "千本桜！" }, { title: "ロキ", producer: "みきとP" }, { title: "ロキ" }, { title: "" }]);
    expect(r).toEqual({ text: "千本桜 / 黒うさP\nロキ / みきとP\n", added: 1 });
  });
  it("追加なしなら元のテキストを返す", () => {
    expect(appendPerformed("abc", [{ title: "abc" }])).toEqual({ text: "abc", added: 0 });
  });
  it("数千行でも速い", () => {
    const text = Array.from({ length: 5000 }, (_, i) => `${i + 1}. 曲名${i} / P${i}`).join("\n");
    const t0 = performance.now();
    expect(parsePerformed(text)).toHaveLength(5000);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
