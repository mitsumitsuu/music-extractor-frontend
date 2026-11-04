import { describe, expect, it } from "vitest";
import { asMode, asProvider, sanitizeExtractRequest, sanitizeFilters, sanitizeLinks } from "@/lib/sanitize";
import { DEFAULT_FILTERS, DEFAULT_LINKS } from "@/lib/types";

const limits = { maxUrls: 3, maxText: 100, maxFiles: 2 };

describe("sanitizeExtractRequest", () => {
  it("null・配列・文字列など壊れた本文でも既定値の安全なリクエストにする", () => {
    for (const raw of [null, undefined, 1, "x", [], {}]) {
      const r = sanitizeExtractRequest(raw, limits);
      expect(r).toMatchObject({ urls: [], text: "", files: [], mode: "fast", provider: "auto", filters: DEFAULT_FILTERS, links: DEFAULT_LINKS });
    }
  });
  it("URL は http(s) のみ・件数上限・前後の空白除去", () => {
    const r = sanitizeExtractRequest({ urls: [" https://a.example/x ", "javascript:alert(1)", "ftp://x", 5, null, "http://b", "https://c", "https://d"] }, limits);
    expect(r.urls).toEqual(["https://a.example/x", "http://b", "https://c"]);
  });
  it("テキストは上限で切り詰め、文字列以外は空", () => {
    expect(sanitizeExtractRequest({ text: "あ".repeat(500) }, limits).text).toHaveLength(100);
    expect(sanitizeExtractRequest({ text: { a: 1 } }, limits).text).toBe("");
  });
  it("ファイル: base64 と MIME の検証、件数上限、不正は捨てる", () => {
    const ok = { name: "a.pdf", mime: "application/pdf", data: "QUJD", size: 3 };
    const r = sanitizeExtractRequest(
      { files: [ok, { ...ok, mime: "application/x-msdownload" }, { ...ok, data: "not base64!!" }, { name: "t.txt", mime: "text/plain", text: "千本桜" }, { name: "none" }, ok] },
      { ...limits, maxFiles: 4 },
    );
    expect(r.files.map((f) => f.name)).toEqual(["a.pdf", "t.txt"]);
    expect(r.files[1]).toMatchObject({ text: "千本桜", mime: "text/plain" });
  });
  it("mode / provider は列挙値以外なら既定へ", () => {
    expect(asMode("ai")).toBe("ai");
    expect(asMode("stats")).toBe("stats");
    expect(asMode("<script>")).toBe("fast");
    expect(asProvider("gemini")).toBe("gemini");
    expect(asProvider("x")).toBe("auto");
  });
  it("API キーは安全な文字種・長さのものだけ受け付ける", () => {
    const r = sanitizeExtractRequest({ keys: { youtube: "AIza-Valid_Key.1234567890", gemini: "short", openai: "bad key with spaces and\nnewline" } }, limits);
    expect(r.keys).toEqual({ youtube: "AIza-Valid_Key.1234567890", gemini: undefined, openai: undefined });
  });
});

describe("sanitizeFilters / sanitizeLinks", () => {
  it("数値は 0 以上の有限値のみ、1e12 で頭打ち、BPM は 1〜999", () => {
    const f = sanitizeFilters({ minViews: -1, maxViews: 1e20, minComments: NaN, maxComments: "5", bpm: 150.4 });
    expect(f).toMatchObject({ minViews: "", maxViews: 1e12, minComments: "", maxComments: "", bpm: 150 });
    expect(sanitizeFilters({ bpm: 0 }).bpm).toBe("");
    expect(sanitizeFilters({ bpm: 1000 }).bpm).toBe("");
  });
  it("文字列の長さ上限と真偽値の型", () => {
    const f = sanitizeFilters({ excludeWords: "a".repeat(1000), multiOnly: "yes", requireMmd: true });
    expect(f.excludeWords).toHaveLength(500);
    expect(f.multiOnly).toBe(false);
    expect(f.requireMmd).toBe(true);
  });
  it("リンクの既定値", () => {
    expect(sanitizeLinks(undefined)).toEqual(DEFAULT_LINKS);
    expect(sanitizeLinks({ lyrics: false })).toEqual({ ...DEFAULT_LINKS, lyrics: false });
  });
});
