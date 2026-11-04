import { describe, expect, it } from "vitest";
import { createPreset, decodeSharedPreset, encodePresetForShare, fitHistory, newId, sanitizePreset, type HistoryEntry } from "@/lib/storage";
import { song } from "./helpers";
import { DEFAULT_FILTERS } from "@/lib/types";

describe("共有リンク（encodePresetForShare / decodeSharedPreset）", () => {
  it("日本語・絵文字・記号を含むプリセットが往復できる", () => {
    const p = { ...createPreset("ライブ用🎤"), pastedText: "千本桜 / 黒うさP\n＜＞&\"'", url: "https://youtu.be/dQw4w9WgXcQ?x=1&y=2", mode: "ai" as const };
    const out = decodeSharedPreset(encodePresetForShare(p));
    expect(out).toMatchObject({ name: "ライブ用🎤", pastedText: p.pastedText, url: p.url, mode: "ai" });
  });
  it("URL に安全な文字だけ（+ / = を含まない）", () => {
    expect(encodePresetForShare(createPreset("x".repeat(30)))).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("id と API キーは含まれない", () => {
    const p = { ...createPreset("a"), geminiKey: "SECRET-KEY-VALUE", ytKey: "SECRET-YT" } as ReturnType<typeof createPreset>;
    const enc = encodePresetForShare(p);
    expect(Buffer.from(enc, "base64url").toString("utf8")).not.toContain(p.id);
    const out = decodeSharedPreset(enc);
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });
  it("壊れた文字列・空・JSON でないものは null", () => {
    for (const s of ["", "%%%", "abc", "e30", "bm90LWpzb24"]) expect(decodeSharedPreset(s) === null || typeof decodeSharedPreset(s)?.name === "string").toBe(true);
    expect(decodeSharedPreset("%%%")).toBeNull();
    expect(decodeSharedPreset("bm90LWpzb24")).toBeNull(); // "not-json"
  });
});

describe("sanitizePreset", () => {
  it("空オブジェクトでも既定のプリセットになる", () => {
    expect(sanitizePreset({})).toMatchObject({ name: "読み込んだプリセット", mode: "fast", provider: "auto", filters: DEFAULT_FILTERS, filename: "playlist" });
  });
  it("型の違う値・過大な文字列を安全に丸める", () => {
    const p = sanitizePreset({ name: "n".repeat(100), pastedText: "x".repeat(400_000), url: 5 as never, useUrl: "yes" as never, mode: "<script>" as never, filename: "" });
    expect(p.name).toHaveLength(40);
    expect(p.pastedText).toHaveLength(300_000);
    expect(p.url).toBe("");
    expect(p.useUrl).toBe(true); // truthy → true
    expect(p.mode).toBe("fast");
    expect(p.filename).toBe("playlist");
  });
  it("旧形式（日本語のモード名・フラットな絞り込み項目）を移行", () => {
    const p = sanitizePreset({ name: "旧", mode: "AI抽出" as never, minV: 1000, excludeWords: "cover", targetVocal: "ミク", addLyrics: false, addBpm: true } as never);
    expect(p.mode).toBe("ai");
    expect(p.filters).toMatchObject({ minViews: 1000, excludeWords: "cover", vocal: "ミク" });
    expect(p.links).toMatchObject({ lyrics: false, tunebat: true });
  });
});

describe("newId", () => {
  it("12文字の英数字で重複しない", () => {
    const ids = new Set(Array.from({ length: 500 }, newId));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("fitHistory（履歴の保存容量）", () => {
  const entry = (id: string, songs: number): HistoryEntry => ({ id, at: 0, presetName: "p", count: songs, songs: Array.from({ length: songs }, (_, i) => song(`曲${i}`)) });
  it("最新20件まで", () => {
    const h = Array.from({ length: 30 }, (_, i) => entry(String(i), 1));
    expect(fitHistory(h).map((e) => e.id)).toEqual(h.slice(0, 20).map((e) => e.id));
  });
  it("容量を超える分は古い順に落とし、新しいものを優先", () => {
    const h = [entry("new", 50), entry("mid", 50), entry("old", 50)];
    const one = JSON.stringify(h[0]).length + 1;
    expect(fitHistory(h, one * 2 + 10).map((e) => e.id)).toEqual(["new", "mid"]);
  });
  it("1件だけ巨大でも、その件を飛ばして古い履歴は残す", () => {
    const h = [entry("huge", 2000), entry("small", 1)];
    expect(fitHistory(h, 5000).map((e) => e.id)).toEqual(["small"]);
  });
  it("空配列・既定の上限（約150万文字）に収まる", () => {
    expect(fitHistory([])).toEqual([]);
    const h = Array.from({ length: 20 }, (_, i) => entry(String(i), 1000));
    expect(JSON.stringify(fitHistory(h)).length).toBeLessThanOrEqual(1_500_000);
  });
});
