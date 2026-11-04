import { describe, expect, it } from "vitest";
import {
  applyFilters, buildLinks, isSeparatorLine, buildYouTubePlaylistUrls, camelotOf, csvCell, dedupe, dedupeKey, extractVideoIds, neutralizeFormula, normalize,
  parseDescription, parseTextBlock, parseTitleLine, parseYouTube, songKey, splitCsvLine, splitLines, toNumberOrEmpty, xmlEscape,
} from "@/lib/parse";
import { DEFAULT_FILTERS } from "@/lib/types";
import { song } from "./helpers";

describe("normalize（全角半角・空白・見えない文字）", () => {
  it("全角英数記号を半角に、全角スペースと連続空白を1つの半角スペースに", () => {
    expect(normalize("ＡＢＣ　１２３！")).toBe("ABC 123!");
    expect(normalize("  a \t\n  b  ")).toBe("a b");
  });
  it("半角カナは全角カナに（濁点・半濁点も結合）", () => {
    expect(normalize("ﾊﾝｶｸ ｶﾞﾅ ﾊﾟｰﾃｨｰ")).toBe("ハンカク ガナ パーティー");
  });
  it("ゼロ幅文字・BOM・ソフトハイフンを取り除く", () => {
    expect(normalize("​千‍本﻿桜­")).toBe("千本桜");
  });
  it("空文字・空白だけは空文字", () => {
    expect(normalize("")).toBe("");
    expect(normalize(" 　\t​")).toBe("");
  });
});

describe("toNumberOrEmpty", () => {
  it.each([
    ["１２３", 123],
    ["1,234", 1234],
    ["1.5", 1],
    ["  42 ", 42],
    ["abc", ""],
    ["", ""],
    ["-5", 5],
    ["12abc", 12],
  ])("%j → %j", (input, expected) => expect(toNumberOrEmpty(input)).toBe(expected));
  it("巨大な数は 1e12 で頭打ち（桁あふれ防止）", () => {
    expect(toNumberOrEmpty("9".repeat(40))).toBe(1e12);
  });
});

describe("songKey / dedupeKey", () => {
  it("大文字小文字・全角半角・空白・記号の違いを無視", () => {
    const keys = ["千本桜", " 千本桜 ", "千本桜!!", "【千本桜】", "「千本桜」"].map(songKey);
    expect(new Set(keys)).toEqual(new Set(["千本桜"]));
    expect(songKey("Ｓenbon  Zakura")).toBe(songKey("SENBON ZAKURA"));
  });
  it("記号だけの曲名は songKey が空、dedupeKey は記号を残す", () => {
    expect(songKey("!!!")).toBe("");
    expect(dedupeKey("!!!")).toBe("!!!");
    expect(dedupeKey("???")).toBe("???");
    expect(dedupeKey("!!!")).not.toBe(dedupeKey("???"));
  });
  it("空白・見えない文字だけなら dedupeKey も空", () => {
    expect(dedupeKey("  ​ ")).toBe("");
  });
});

describe("splitLines / splitCsvLine", () => {
  it("CRLF・LF・CR のみ・Unicode 行区切りで分割", () => {
    expect(splitLines("a\r\nb\nc\rd e f")).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
  it("引用符内のカンマと二重引用符のエスケープ", () => {
    expect(splitCsvLine('a,"b,c","say ""hi""",d')).toEqual(["a", "b,c", 'say "hi"', "d"]);
  });
  it("閉じていない引用符でも例外にならない", () => {
    expect(splitCsvLine('"abc, def')).toEqual(["abc, def"]);
  });
  it("空列を保つ", () => {
    expect(splitCsvLine("a,,c,")).toEqual(["a", "", "c", ""]);
  });
});

describe("parseTitleLine", () => {
  it("曲名 / P名 feat. 歌唱者", () => {
    expect(parseTitleLine("ロキ / みきとP feat. 鏡音リン")).toEqual({ title: "ロキ", producer: "みきとP", vocal: "鏡音リン" });
  });
  it("【歌唱者】曲名【オリジナル】", () => {
    expect(parseTitleLine("【初音ミク】千本桜【オリジナル】")).toMatchObject({ title: "千本桜", vocal: "初音ミク" });
  });
  it("P名 - 曲名 と全角の feat.", () => {
    expect(parseTitleLine("ＤＥＣＯ＊２７ - ヴァンパイア ｆｅａｔ． 初音ミク")).toEqual({ title: "ヴァンパイア", producer: "DECO*27", vocal: "初音ミク" });
  });
  it("ランキング接頭辞（1位 / 01. / #3 / ①）を除去", () => {
    for (const l of ["1位 千本桜", "01. 千本桜", "#3 千本桜", "① 千本桜", "第12位　千本桜"]) expect(parseTitleLine(l)?.title).toBe("千本桜");
  });
  it("チャンネル名を P として補完（- Topic は除く）", () => {
    expect(parseTitleLine("千本桜", "黒うさP - Topic")).toEqual({ title: "千本桜", producer: "黒うさP", vocal: undefined });
  });
  it("空・URL のみ・順位のみは null", () => {
    expect(parseTitleLine("")).toBeNull();
    expect(parseTitleLine("   ")).toBeNull();
    expect(parseTitleLine("https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(parseTitleLine("100位")).toBeNull();
  });
  it("記号だらけの曲名も落とさない", () => {
    expect(parseTitleLine("!!!???")?.title).toBe("!!!???");
    expect(parseTitleLine("♪♪♪")?.title).toBe("♪♪♪");
    expect(parseTitleLine("(●＾o＾●)")?.title).toBe("(●^o^●)");
  });
  it("長すぎる題名（>120 文字）は曲名として扱わない", () => {
    expect(parseTitleLine("あ".repeat(121))).toBeNull();
    expect(parseTitleLine("あ".repeat(120))?.title).toHaveLength(120);
  });
  it("括弧が閉じない超長文でも固まらない（正規表現の暴走防止）", () => {
    const t0 = performance.now();
    for (const s of ["【MV".repeat(100_000), "【".repeat(300_000), "[".repeat(300_000), "(".repeat(300_000)]) expect(parseTitleLine(s)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("parseTextBlock", () => {
  it("空入力・空白・改行だけなら空配列", () => {
    for (const t of ["", "   ", "\n\n\r\n", "\t\t", "​​"]) expect(parseTextBlock(t)).toEqual([]);
  });
  it("改行コード CRLF / LF / CR のみ を同じに扱う", () => {
    const expected = parseTextBlock("千本桜 / 黒うさP\nロキ / みきとP");
    expect(expected).toHaveLength(2);
    expect(parseTextBlock("千本桜 / 黒うさP\r\nロキ / みきとP")).toEqual(expected);
    expect(parseTextBlock("千本桜 / 黒うさP\rロキ / みきとP")).toEqual(expected);
    expect(parseTextBlock("千本桜 / 黒うさP ロキ / みきとP")).toEqual(expected);
  });
  it("全角の数字・スラッシュ・スペースの行", () => {
    expect(parseTextBlock("１．千本桜　／　黒うさP")).toEqual([{ title: "千本桜", producer: "黒うさP", url: undefined }]);
  });
  it("URL は url に分離し、URL だけの行は捨てる", () => {
    expect(parseTextBlock("千本桜 https://youtu.be/dQw4w9WgXcQ")).toEqual([{ title: "千本桜", url: "https://youtu.be/dQw4w9WgXcQ" }]);
    expect(parseTextBlock("https://youtu.be/dQw4w9WgXcQ")).toEqual([]);
  });
  it("見出し行（曲名,… / 順位\\t… / title,…）を読み飛ばす", () => {
    expect(parseTextBlock("曲名,ボカロP\n千本桜,黒うさP")).toHaveLength(1);
    expect(parseTextBlock("順位\t曲名\tP\n1\tロキ\tみきとP")).toEqual([{ title: "ロキ", producer: "みきとP", url: undefined }]);
    expect(parseTextBlock("Title,Artist\nA,B")).toHaveLength(1);
  });
  it("CSV: 引用符内のカンマ・二重引用符", () => {
    expect(parseTextBlock('"Hello, World",Foo\n"say ""hi""",Bar')).toEqual([
      { title: "Hello, World", producer: "Foo", url: undefined },
      { title: 'say "hi"', producer: "Bar", url: undefined },
    ]);
  });
  it("CSV/TSV: 先頭の順位列（1 / 第1位 / #1）を読み飛ばす", () => {
    for (const l of ["1,千本桜,黒うさP", "1\t千本桜\t黒うさP", "第1位,千本桜,黒うさP", "#1\t千本桜\t黒うさP"]) {
      expect(parseTextBlock(l)).toEqual([{ title: "千本桜", producer: "黒うさP", url: undefined }]);
    }
    expect(parseTextBlock("第1位\t千本桜")).toEqual([{ title: "千本桜", url: undefined }]);
  });
  it("CSV: P列が URL なら P にしない / URL 列は url に", () => {
    expect(parseTextBlock("千本桜,https://youtu.be/dQw4w9WgXcQ")).toEqual([{ title: "千本桜", url: "https://youtu.be/dQw4w9WgXcQ" }]);
    expect(parseTextBlock("千本桜,黒うさP,https://youtu.be/dQw4w9WgXcQ")[0]).toMatchObject({ title: "千本桜", producer: "黒うさP", url: "https://youtu.be/dQw4w9WgXcQ" });
  });
  it("半角カナ・ゼロ幅文字入りの行を正規化", () => {
    expect(parseTextBlock("ﾊﾝｶｸ")[0].title).toBe("ハンカク");
    expect(parseTextBlock("﻿千本桜 / 黒うさP")[0].title).toBe("千本桜");
  });
  it("記号だけの題名・数字だけの題名は残す（順位だけの行は残さない）", () => {
    expect(parseTextBlock("!!!???")).toHaveLength(1);
    expect(parseTextBlock("100")).toHaveLength(1);
    expect(parseTextBlock("100位\nNo.1\n***")).toEqual([]);
  });
  it("区切り線（===== ----- ━━━ ***）は読み飛ばし、記号だけの曲名とは区別する", () => {
    expect(parseTextBlock("=====\n-----\n_____\n━━━━\n＝＝＝\n***\n千本桜")).toEqual([{ title: "千本桜", url: undefined }]);
    expect(isSeparatorLine("====")).toBe(true);
    expect(isSeparatorLine("==")).toBe(false); // 短いものは曲名かもしれない
    expect(isSeparatorLine("!!!")).toBe(false);
  });
  it("2000 文字を超える行（段落・ゴミ）は読み飛ばす", () => {
    expect(parseTextBlock("x".repeat(2001))).toEqual([]);
    expect(parseTextBlock(`${"x".repeat(2001)}\n千本桜`)).toHaveLength(1);
  });
  it("数式風の文字列もそのまま保持（出力時に無効化する）", () => {
    expect(parseTextBlock("=SUM(A1)")[0].title).toBe("=SUM(A1)");
  });
  it("数千行の貼り付けでも十分速い", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `${i + 1}位 曲名${i} / ボカロP${i} feat. 初音ミク`).join("\n");
    const t0 = performance.now();
    const r = parseTextBlock(lines);
    expect(r).toHaveLength(5000);
    expect(r[4999]).toMatchObject({ title: "曲名4999", producer: "ボカロP4999", vocal: "初音ミク" });
    expect(performance.now() - t0).toBeLessThan(2000);
  });
  it("巨大入力（30万文字・1行）でも固まらない", () => {
    const t0 = performance.now();
    expect(parseTextBlock("【MV".repeat(100_000))).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("parseYouTube / extractVideoIds / buildYouTubePlaylistUrls", () => {
  const ID = "dQw4w9WgXcQ";
  it.each([
    [`https://www.youtube.com/watch?v=${ID}&list=PLabc`, { videoId: ID, listId: "PLabc" }],
    [`https://youtu.be/${ID}?t=3`, { videoId: ID }],
    [`https://music.youtube.com/watch?v=${ID}`, { videoId: ID }],
    [`https://m.youtube.com/shorts/${ID}`, { videoId: ID }],
    [`https://www.youtube-nocookie.com/embed/${ID}`, { videoId: ID }],
    [`https://evil.example/?v=${ID}`, {}],
    ["not a url", {}],
    ["", {}],
  ])("%s", (url, expected) => expect(parseYouTube(url)).toMatchObject(expected));
  it("URL だけのとき listId を取り出す", () => {
    expect(parseYouTube("https://www.youtube.com/playlist?list=PLxyz")).toEqual({ videoId: undefined, listId: "PLxyz" });
  });
  it("テキストから動画IDを重複なく抽出", () => {
    expect(extractVideoIds(`https://www.youtube.com/watch?v=${ID} https://youtu.be/${ID} https://www.youtube.com/watch?feature=x&v=abcdefghijk`)).toEqual([ID, "abcdefghijk"]);
  });
  it("プレイリストURLは50件ずつに分割", () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id${String(i).padStart(9, "0")}`);
    const urls = buildYouTubePlaylistUrls(ids);
    expect(urls).toHaveLength(3);
    expect(urls[0].split("=")[1].split(",")).toHaveLength(50);
    expect(urls[2].split("=")[1].split(",")).toHaveLength(20);
    expect(buildYouTubePlaylistUrls([])).toEqual([]);
  });
});

describe("buildLinks", () => {
  it("記号入りの曲名・P名をURLエンコード", () => {
    const l = buildLinks({ title: "a&b #1 ?", producer: "P/Q" }, { lyrics: true, analysis: true, tunebat: true });
    expect(l.youtube).toBe("https://www.youtube.com/results?search_query=a%26b%20%231%20%3F%20P%2FQ");
    expect(l.lyrics).toContain("Keyword=a%26b%20%231%20%3F");
    expect(l.analysis).toContain("keyword=a%26b%20%231%20%3F");
    expect(l.tunebat).toContain("q=a%26b%20%231%20%3F%20P%2FQ");
  });
  it("動画URLがあればそれを優先、オプション off のリンクは作らない", () => {
    const l = buildLinks({ title: "x", url: "https://youtu.be/dQw4w9WgXcQ" }, { lyrics: false, analysis: false, tunebat: false });
    expect(l).toEqual({ youtube: "https://youtu.be/dQw4w9WgXcQ", lyrics: undefined, analysis: undefined, tunebat: undefined });
  });
});

describe("parseDescription", () => {
  it("BPM / Key / MMD（全角数字も可）", () => {
    expect(parseDescription("BPM：１５０ Key: Am MMD配布")).toEqual({ bpm: 150, key: "Am", mmd: "あり" });
  });
  it("範囲外の BPM は無視、空は空オブジェクト", () => {
    expect(parseDescription("BPM 39").bpm).toBeUndefined();
    expect(parseDescription("BPM 301").bpm).toBeUndefined();
    expect(parseDescription(undefined)).toEqual({});
    expect(parseDescription("")).toEqual({});
  });
});

describe("camelotOf", () => {
  it.each([["Am", "8A"], ["8A", "8A"], ["C major", "8B"], ["F#m", "11A"], ["Gb", "2B"], ["a minor", "8A"], ["12B", "12B"], ["c#m", "12A"]])("%s → %s", (k, c) => expect(camelotOf(k)).toBe(c));
  it.each([[undefined], [""], ["  "], ["H"], ["xyz"]])("判定できない %j は undefined", (k) => expect(camelotOf(k)).toBeUndefined());
});

describe("dedupe", () => {
  it("全角半角・記号違いの同名曲を1曲に統合し、情報を補完", () => {
    const r = dedupe([song("千本桜", { producer: "黒うさP" }), song("千本桜!", { vocal: "初音ミク", bpm: 154 }), song("ＳＥＮ"), song("sen")]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ producer: "黒うさP", vocal: "初音ミク", bpm: 154 });
  });
  it("記号だけの曲名は消さず、別々の記号なら別の曲として残す", () => {
    expect(dedupe([song("!!!"), song("???"), song("!!!")]).map((s) => s.title)).toEqual(["!!!", "???"]);
  });
  it("空白・見えない文字だけの曲名は捨てる", () => {
    expect(dedupe([song("  "), song("​")])).toEqual([]);
  });
  it("再生数・コメント数は大きい方、MMD は『不明』より情報のある方", () => {
    const [r] = dedupe([song("a", { views: 10, comments: 5, mmd: "不明" }), song("a", { views: 100, comments: 1, mmd: "あり" })]);
    expect(r).toMatchObject({ views: 100, comments: 5, mmd: "あり" });
  });
  it("元の並び順を保つ / 空配列は空配列", () => {
    expect(dedupe([song("b"), song("a"), song("b")]).map((s) => s.title)).toEqual(["b", "a"]);
    expect(dedupe([])).toEqual([]);
  });
  it("数千曲でも速い", () => {
    const songs = Array.from({ length: 6000 }, (_, i) => song(`曲名${i % 3000}`));
    const t0 = performance.now();
    expect(dedupe(songs)).toHaveLength(3000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("applyFilters", () => {
  const f = (o: Partial<typeof DEFAULT_FILTERS>) => ({ ...DEFAULT_FILTERS, ...o });
  const titles = (r: { kept: { title: string }[] }) => r.kept.map((s) => s.title);
  it("フィルタなしなら全曲残る", () => {
    expect(titles(applyFilters([song("a"), song("b")], f({}), false))).toEqual(["a", "b"]);
  });
  it("除外ワード（全角・読点区切り・大文字小文字無視）", () => {
    const r = applyFilters([song("Abc"), song("xyz"), song("q")], f({ excludeWords: "ＡＢ、q" }), false);
    expect(titles(r)).toEqual(["xyz"]);
    expect(r.dropped).toEqual({ 除外ワード: 2 });
  });
  it("再生数: 通常モードは不明を残し、統計モードは落とす", () => {
    const songs = [song("a", { views: 0 }), song("b", { views: 10 }), song("c")];
    expect(titles(applyFilters(songs, f({ minViews: 5 }), false))).toEqual(["b", "c"]);
    expect(titles(applyFilters(songs, f({ minViews: 5 }), true))).toEqual(["b"]);
    expect(titles(applyFilters(songs, f({ maxViews: 5 }), true))).toEqual(["a"]);
  });
  it("BPM は ±3 まで許容、不明は落とす", () => {
    const songs = [song("a", { bpm: 150 }), song("b", { bpm: 153 }), song("c", { bpm: 154 }), song("d")];
    expect(titles(applyFilters(songs, f({ bpm: 150 }), false))).toEqual(["a", "b"]);
  });
  it("Key は表記ゆれ（Am / 8A / A minor）を同一視", () => {
    const songs = [song("a", { key: "Am" }), song("b", { key: "8A" }), song("c", { key: "C" }), song("d")];
    expect(titles(applyFilters(songs, f({ key: "A minor" }), false))).toEqual(["a", "b"]);
  });
  it("ボカロ・P の指定は部分一致", () => {
    const songs = [song("a", { vocal: "初音ミク・鏡音リン", producer: "黒うさP" }), song("b", { vocal: "GUMI", producer: "みきとP" })];
    expect(titles(applyFilters(songs, f({ vocal: "ミク" }), false))).toEqual(["a"]);
    expect(titles(applyFilters(songs, f({ producer: "みきと" }), false))).toEqual(["b"]);
    expect(titles(applyFilters(songs, f({ vocal: "ミク", multiOnly: true }), false))).toEqual(["a"]);
  });
  it("MMD あり指定", () => {
    expect(titles(applyFilters([song("a", { mmd: "あり" }), song("b", { mmd: "なし" }), song("c")], f({ requireMmd: true }), false))).toEqual(["a"]);
  });
});

describe("書き出し用のエスケープ", () => {
  it("neutralizeFormula: = + - @ タブ CR の先頭を無効化", () => {
    for (const s of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1"]) expect(neutralizeFormula(s)).toBe("'" + s);
    for (const s of ["千本桜", "a=b", " =x", ""]) expect(neutralizeFormula(s)).toBe(s);
  });
  it("csvCell: 引用符のエスケープ・null/undefined・数値", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell("=cmd|' /C calc'!A0")).toBe(`"'=cmd|' /C calc'!A0"`);
    expect(csvCell("a,b\nc")).toBe('"a,b\nc"');
  });
  it("xmlEscape", () => {
    expect(xmlEscape(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
    expect(xmlEscape(undefined)).toBe("");
  });
});
