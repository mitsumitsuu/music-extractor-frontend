import { describe, expect, it } from "vitest";
import { PRODUCER_SPLIT, VOCAL_SPLIT, bpmHistogram, countBy, mmdRatio, pickRandom } from "@/lib/stats";
import { song } from "./helpers";

describe("countBy", () => {
  it("複数人は各人にカウント、未設定は unknown、同一曲内の重複名は1回", () => {
    const songs = [song("a", { vocal: "初音ミク・鏡音リン" }), song("b", { vocal: "初音ミク" }), song("c", { vocal: "初音ミク・初音ミク" }), song("d")];
    const r = countBy(songs, (s) => s.vocal, VOCAL_SPLIT);
    expect(r.rows).toEqual([{ label: "初音ミク", count: 3 }, { label: "鏡音リン", count: 1 }]);
    expect(r.unknown).toBe(1);
    expect(r.distinct).toBe(2);
  });
  it("上位 N 件に絞り、同数は名前順", () => {
    const songs = ["b", "a", "c"].map((p) => song("x", { producer: p }));
    expect(countBy(songs, (s) => s.producer, PRODUCER_SPLIT, 2).rows.map((r) => r.label)).toEqual(["a", "b"]);
  });
  it("空配列", () => {
    expect(countBy([], (s) => s.vocal, VOCAL_SPLIT)).toEqual({ rows: [], unknown: 0, distinct: 0 });
  });
});

describe("bpmHistogram", () => {
  it("階級ごとの件数・最小/最大/平均、間の空階級も含める", () => {
    const r = bpmHistogram([song("a", { bpm: 100 }), song("b", { bpm: 105 }), song("c", { bpm: 135 }), song("d")]);
    expect(r.bins.map((b) => [b.from, b.count])).toEqual([[100, 2], [110, 0], [120, 0], [130, 1]]);
    expect(r).toMatchObject({ known: 3, unknown: 1, min: 100, max: 135, avg: 113.3 });
  });
  it("BPM が一つも無い・0 や NaN は不明扱い", () => {
    expect(bpmHistogram([song("a"), song("b", { bpm: 0 }), song("c", { bpm: NaN })])).toEqual({ bins: [], known: 0, unknown: 3 });
    expect(bpmHistogram([])).toEqual({ bins: [], known: 0, unknown: 0 });
  });
});

describe("mmdRatio", () => {
  it("あり / なし / 不明の集計と割合", () => {
    expect(mmdRatio([song("a", { mmd: "あり" }), song("b", { mmd: "なし" }), song("c", { mmd: "不明" }), song("d")])).toEqual({ yes: 1, no: 1, unknown: 2, total: 4, ratio: 0.25 });
    expect(mmdRatio([])).toMatchObject({ total: 0, ratio: 0 });
  });
});

describe("pickRandom", () => {
  const items = [1, 2, 3, 4, 5];
  it("重複なしで n 個、元の配列は変えない", () => {
    const copy = [...items];
    const r = pickRandom(items, 3);
    expect(r).toHaveLength(3);
    expect(new Set(r).size).toBe(3);
    expect(items).toEqual(copy);
  });
  it("n が範囲外・NaN・小数でも安全", () => {
    expect(pickRandom(items, 99)).toHaveLength(5);
    expect(pickRandom(items, -3)).toEqual([]);
    expect(pickRandom(items, NaN)).toEqual([]);
    expect(pickRandom(items, 2.9)).toHaveLength(2);
    expect(pickRandom([], 3)).toEqual([]);
  });
  it("乱数が 1 に近い値でも範囲外を読まない（決定的な rng）", () => {
    expect(pickRandom(items, 5, () => 0.999999)).toHaveLength(5);
    expect(pickRandom(items, 5, () => 0).sort()).toEqual(items);
  });
});
