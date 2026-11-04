import { describe, expect, it } from "vitest";
import { toTSV, youtubePlaylistUrls } from "@/lib/exporters";
import { song } from "./helpers";

describe("toTSV", () => {
  it("見出し行 + 曲ごとの行、列数が揃う", () => {
    const rows = toTSV([song("千本桜", { producer: "黒うさP", bpm: 154, views: 1000 }), song("ロキ")]).split("\n");
    expect(rows[0]).toBe("曲名\tボカロP\t合成音声\tBPM\tKey\tMMD\t再生数\tコメント数\tURL");
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.split("\t").length))).toEqual(new Set([9]));
    expect(rows[1].split("\t").slice(0, 4)).toEqual(["千本桜", "黒うさP", "", "154"]);
  });
  it("セル内のタブ・改行は空白に", () => {
    expect(toTSV([song("a\tb\nc\r\nd")]).split("\n")[1].split("\t")[0]).toBe("a b c d");
  });
  it("数式として実行されうる先頭文字を無効化", () => {
    const row = toTSV([song("=HYPERLINK(\"x\")", { producer: "+1", vocal: "-2", key: "@a" })]).split("\n")[1].split("\t");
    expect(row.slice(0, 5)).toEqual(["'=HYPERLINK(\"x\")", "'+1", "'-2", "", "'@a"]);
  });
  it("曲が0件でも見出しだけ返す", () => {
    expect(toTSV([]).split("\n")).toHaveLength(1);
  });
});

describe("youtubePlaylistUrls", () => {
  it("動画IDのある曲だけ・重複なしで連続再生URLにする", () => {
    const ID = "dQw4w9WgXcQ";
    const urls = youtubePlaylistUrls([song("a", { url: `https://youtu.be/${ID}` }), song("b", { url: `https://www.youtube.com/watch?v=${ID}` }), song("c"), song("d", { url: "https://example.com/x" }), song("e", { url: "https://youtu.be/abcdefghijk" })]);
    expect(urls).toEqual([`https://www.youtube.com/watch_videos?video_ids=${ID},abcdefghijk`]);
    expect(youtubePlaylistUrls([])).toEqual([]);
  });
});
