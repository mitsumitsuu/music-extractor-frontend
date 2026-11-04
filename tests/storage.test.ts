import { describe, expect, it } from "vitest";
import { createPreset, decodeSharedPreset, encodePresetForShare, newId, sanitizePreset } from "@/lib/storage";
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
