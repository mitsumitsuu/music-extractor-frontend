import { describe, expect, it } from "vitest";
import { applySongEdit, type SongEditDraft } from "@/lib/song-edit";
import { buildLinks } from "@/lib/parse";
import type { Song } from "@/lib/types";

const ID = "dQw4w9WgXcQ";
const original: Song = {
  id: "1", title: "千本桜", producer: "黒うさP", bpm: 154, views: 100, comments: 5, publishedAt: "2020-01-01", url: `https://www.youtube.com/watch?v=${ID}`,
  links: buildLinks({ title: "千本桜", url: `https://www.youtube.com/watch?v=${ID}` }, { lyrics: true, analysis: false, tunebat: true }),
};
const draft = (o: Partial<SongEditDraft> = {}): SongEditDraft => ({ title: "千本桜", producer: "黒うさP", vocal: "", bpm: "154", key: "", mmd: "", url: original.url!, ...o });
const ok = (d: SongEditDraft) => { const r = applySongEdit(original, d); if (!r.ok) throw new Error(r.error); return r.song; };

describe("applySongEdit", () => {
  it("曲名が空（全角空白のみ含む）ならエラー", () => {
    expect(applySongEdit(original, draft({ title: "   " }))).toMatchObject({ ok: false });
  });
  it("元の楽曲を書き換えない", () => {
    const copy = structuredClone(original);
    ok(draft({ title: "別名" }));
    expect(original).toEqual(copy);
  });
  it("BPM: 全角・小数は OK、0 / 1000 / 文字列 / 負数 / 1e3 はエラー、空は未設定", () => {
    expect(ok(draft({ bpm: "１５０" })).bpm).toBe(150);
    expect(ok(draft({ bpm: "150.5" })).bpm).toBe(150.5);
    expect(ok(draft({ bpm: "" })).bpm).toBeUndefined();
    for (const bpm of ["0", "1000", "abc", "-5", "1e3", "15 0x"]) expect(applySongEdit(original, draft({ bpm })).ok, bpm).toBe(false);
  });
  it("URL: http(s) のみ。javascript: や認証情報付きはエラー", () => {
    for (const url of ["javascript:alert(1)", "ftp://x.example/a", "https://user:pw@example.com/", "example.com/a", "https://"]) expect(applySongEdit(original, draft({ url })).ok, url).toBe(false);
    expect(ok(draft({ url: "https://example.com/a?b=c" })).url).toBe("https://example.com/a?b=c");
  });
  it("YouTube は動画ページの URL のみ（検索・プレイリストは不可）", () => {
    expect(applySongEdit(original, draft({ url: "https://www.youtube.com/results?search_query=a" })).ok).toBe(false);
    expect(applySongEdit(original, draft({ url: "https://www.youtube.com/playlist?list=PLx" })).ok).toBe(false);
    expect(ok(draft({ url: "https://youtu.be/abcdefghijk" })).url).toBe("https://youtu.be/abcdefghijk");
  });
  it("同じ動画の別形式の URL なら再生数などを残し、別動画に変えたら消す", () => {
    const same = ok(draft({ url: `https://youtu.be/${ID}` }));
    expect(same).toMatchObject({ views: 100, comments: 5, publishedAt: "2020-01-01" });
    const other = ok(draft({ url: "https://youtu.be/abcdefghijk" }));
    expect(other.views).toBeUndefined();
    expect(other.comments).toBeUndefined();
  });
  it("URL を消すと検索リンクに戻る / 曲名を変えるとリンクも更新", () => {
    const s = ok(draft({ url: "", title: "ロキ" }));
    expect(s.url).toBeUndefined();
    expect(s.links.youtube).toContain("search_query=" + encodeURIComponent("ロキ 黒うさP"));
    expect(s.links.lyrics).toContain(encodeURIComponent("ロキ"));
    expect(s.links.analysis).toBeUndefined();
  });
  it("空欄の任意項目は undefined に", () => {
    const s = ok(draft({ producer: "  ", vocal: "", key: " ", mmd: "" }));
    expect(s).toMatchObject({ producer: undefined, vocal: undefined, key: undefined, mmd: undefined });
  });
});
