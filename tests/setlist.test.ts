import { describe, expect, it } from "vitest";
import {
  addSongsToSetlist, bpmFlow, buildTemplateItems, camelotRelation, cloneSetlist, computeTimeline, createBlock, createSetlist, createSongItem, findDuplicates,
  findPerformed, formatClock, formatDuration, insertSongItems, keyFlow, mergeSetlists, moveItem, parseClock, parseDuration, parseSetlistBackup, sanitizeItem,
  sanitizeSetlist, setlistToText, setlistToTSV, setlistsToJSON, type SetlistItem,
} from "@/lib/setlist";
import { song } from "./helpers";

const item = (type: SetlistItem["type"], title: string, duration = 240, extra: Partial<SetlistItem> = {}): SetlistItem => ({ id: `${type}-${title}`, type, title, duration, ...extra });

describe("parseDuration / formatDuration", () => {
  it.each([
    ["4:00", 240], ["3:30", 210], ["1:02:03", 3723], ["3分30秒", 210], ["90秒", 90], ["240s", 240], ["4", 240], ["3.5", 210], ["１：３０", 90], ["２分", 120], ["1時間", 3600], ["0", 0],
  ])("%s → %s 秒", (input, sec) => expect(parseDuration(input)).toBe(sec));
  it.each([[""], ["  "], ["abc"], ["4:60"], ["1:99:00"], ["-3"], ["11:00:00"], ["分"], ["1e3"]])("%j は null", (input) => expect(parseDuration(input)).toBeNull());
  it("formatDuration: m:ss / h:mm:ss、負数・NaN は 0:00", () => {
    expect(formatDuration(240)).toBe("4:00");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(NaN)).toBe("0:00");
    expect(formatDuration(59.6)).toBe("1:00");
  });
});

describe("parseClock / formatClock", () => {
  it("HH:MM（全角可）の解釈と範囲外", () => {
    expect(parseClock("13:00")).toBe(46800);
    expect(parseClock("９：５")).toBeNull();
    expect(parseClock("９:05")).toBe(9 * 3600 + 300);
    for (const s of ["24:00", "12:60", "", undefined, "abc"]) expect(parseClock(s)).toBeNull();
  });
  it("24時を超えたら翌日に折り返す", () => {
    expect(formatClock(23 * 3600 + 30 * 60 + 45 * 60)).toBe("0:15");
  });
});

describe("computeTimeline", () => {
  const items = [item("op", "OP", 90), item("song", "A", 240), item("mc", "MC①", 120), item("song", "B", 200)];
  it("経過時間・合計・曲数・MC数", () => {
    const tl = computeTimeline(items);
    expect(tl.rows.map((r) => r.start)).toEqual(["0:00", "1:30", "5:30", "7:30"]);
    expect(tl).toMatchObject({ total: 650, songCount: 2, mcCount: 1, blockCount: 2 });
    expect(tl.byId["song-B"].songNo).toBe(2);
    expect(tl.endClock).toBeUndefined();
  });
  it("開始時刻あり: 時計表示と終了時刻", () => {
    const tl = computeTimeline(items, "13:00");
    expect(tl.rows[1].start).toBe("13:01");
    expect(tl).toMatchObject({ startClock: "13:00", endClock: "13:10" });
  });
  it("空のセトリ・負の長さ", () => {
    expect(computeTimeline([])).toMatchObject({ total: 0, rows: [], songCount: 0 });
    expect(computeTimeline([item("song", "x", -10)]).total).toBe(0);
  });
});

describe("findDuplicates / findPerformed", () => {
  const items = [item("song", "千本桜"), item("song", "千本桜!", 240, { id: "dup" }), item("mc", "千本桜"), item("song", "（曲枠1）", 240, { placeholder: true }), item("song", "ロキ")];
  it("表記ゆれの重複を検出（曲以外・曲枠は対象外）", () => {
    const d = findDuplicates(items);
    expect([...d.ids].sort()).toEqual(["dup", "song-千本桜"].sort());
    expect(d.titles).toEqual(["千本桜"]);
    expect(findDuplicates([]).titles).toEqual([]);
  });
  it("演奏済みの曲を検出", () => {
    const p = findPerformed(items, new Set(["ロキ"]));
    expect(p.titles).toEqual(["ロキ"]);
    expect(findPerformed(items, new Set()).ids.size).toBe(0);
  });
});

describe("bpmFlow / keyFlow", () => {
  it("BPM の急変（既定 40 以上）を検出し、不明は数える", () => {
    const f = bpmFlow([item("song", "a", 1, { bpm: 100 }), item("song", "b", 1, { bpm: 150 }), item("song", "c"), item("song", "d", 1, { bpm: 152 }), item("mc", "m")]);
    expect(f.points.map((p) => p.bpm)).toEqual([100, 150, 152]);
    expect(f.jumps.map((j) => j.delta)).toEqual([50]);
    expect(f).toMatchObject({ songTotal: 4, unknown: 1 });
  });
  it("camelotRelation", () => {
    expect(camelotRelation("8A", "8A")).toBe("same");
    expect(camelotRelation("8A", "8B")).toBe("near");
    expect(camelotRelation("8A", "9A")).toBe("near");
    expect(camelotRelation("12A", "1A")).toBe("near");
    expect(camelotRelation("8A", "10A")).toBe("far");
    expect(camelotRelation("8A", undefined)).toBe("unknown");
  });
  it("keyFlow: MC を挟むと adjacent=false", () => {
    const t = keyFlow([item("song", "a", 1, { key: "Am" }), item("song", "b", 1, { key: "Em" }), item("mc", "m"), item("song", "c", 1, { key: "zzz" })]);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ relation: "near", adjacent: true });
    expect(t[1]).toMatchObject({ relation: "unknown", adjacent: false });
  });
});

describe("セトリの作成・編集", () => {
  it("MC は番号付き（MC① MC②…）、21個目以降は数字", () => {
    const mcs: SetlistItem[] = [];
    for (let i = 0; i < 21; i++) mcs.push(createBlock("mc", mcs));
    expect(mcs[0].title).toBe("MC①");
    expect(mcs[1].title).toBe("MC②");
    expect(mcs[20].title).toBe("MC 21");
    expect(createBlock("ed", [], "  終演  ").title).toBe("終演");
  });
  it("テンプレート: 標準は曲枠8・MC2", () => {
    const items = buildTemplateItems("standard");
    expect(items.filter((i) => i.type === "song" && i.placeholder)).toHaveLength(8);
    expect(items.filter((i) => i.type === "mc")).toHaveLength(2);
    expect(buildTemplateItems("存在しない").length).toBe(items.length);
    expect(buildTemplateItems("empty")).toEqual([]);
  });
  it("曲を入れると曲枠を先に埋め、余りは最後の曲の後ろに入る", () => {
    const sl = createSetlist({ templateId: "mini" });
    const songs = ["a", "b", "c", "d", "e", "f"].map((t) => createSongItem({ title: t }));
    const r = insertSongItems(sl, songs);
    expect(r.filled).toBe(4);
    expect(r.added).toBe(2);
    expect(r.setlist.items.filter((i) => i.type === "song").map((i) => i.title)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(r.setlist.items.at(-1)?.type).toBe("ed");
    expect(sl.items.every((i) => i.type !== "song" || i.placeholder)).toBe(true); // 元は変更されない
  });
  it("addSongsToSetlist: 空の曲リスト", () => {
    const sl = createSetlist();
    expect(addSongsToSetlist(sl, []).setlist.items).toEqual([]);
    expect(addSongsToSetlist(sl, [song("x", { bpm: 150, key: " Am " })]).setlist.items[0]).toMatchObject({ title: "x", bpm: 150, key: "Am" });
  });
  it("createSetlist: 名前を整形（空なら既定名・60文字まで）", () => {
    expect(createSetlist({ name: "   " }).name).toBe("新しいセトリ");
    expect(createSetlist({ name: "あ".repeat(100) }).name).toHaveLength(60);
  });
  it("moveItem: 範囲外は同じ配列、通常は並べ替え", () => {
    const a = [1, 2, 3];
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem(a, -1, 1)).toBe(a);
    expect(moveItem(a, 0, 3)).toBe(a);
    expect(moveItem(a, 1, 1)).toBe(a);
  });
  it("cloneSetlist: 新しい id・名前に『のコピー』", () => {
    const sl = createSetlist({ name: "公演", templateId: "mini" });
    const c = cloneSetlist(sl);
    expect(c.id).not.toBe(sl.id);
    expect(c.name).toBe("公演 のコピー");
    expect(new Set(c.items.map((i) => i.id)).size).toBe(c.items.length);
    expect(c.items.some((i) => sl.items.some((o) => o.id === i.id))).toBe(false);
  });
});

describe("検証（保存データ・バックアップの読み込み）", () => {
  it("sanitizeItem: 壊れた項目は null、型・長さを補正", () => {
    for (const raw of [null, 1, "x", {}, { title: "  " }]) expect(sanitizeItem(raw)).toBeNull();
    const it = sanitizeItem({ title: "a".repeat(500), type: "???", duration: 1e9, bpm: 5000, url: "javascript:alert(1)" });
    expect(it?.title).toHaveLength(200);
    expect(it?.type).toBe("custom");
    expect(it?.duration).toBe(10 * 3600);
    const s = sanitizeItem({ title: "x", type: "song", bpm: 5000, url: "javascript:alert(1)", mmd: "?", placeholder: true });
    expect(s).toMatchObject({ type: "song", placeholder: true });
    expect(s).not.toHaveProperty("bpm");
    expect(s).not.toHaveProperty("url");
    expect(s).not.toHaveProperty("mmd");
  });
  it("sanitizeSetlist: 重複 id を解消し、日付・開始時刻を検証、項目は300件まで", () => {
    const items = Array.from({ length: 320 }, () => ({ id: "same", title: "x", type: "song" }));
    const sl = sanitizeSetlist({ name: "n", date: "2026/01/01", startTime: "25:00", items });
    expect(sl?.items).toHaveLength(300);
    expect(new Set(sl?.items.map((i) => i.id)).size).toBe(300);
    expect(sl?.date).toBeUndefined();
    expect(sl?.startTime).toBeUndefined();
    expect(sanitizeSetlist(null)).toBeNull();
    expect(sanitizeSetlist({ date: "2026-01-01", startTime: "13:30" })).toMatchObject({ date: "2026-01-01", startTime: "13:30", items: [], name: "読み込んだセトリ" });
  });
  it("parseSetlistBackup: 壊れた JSON は null、3種類の形式を読める、書き出し→読み込みで往復できる", () => {
    expect(parseSetlistBackup("{ broken")).toBeNull();
    expect(parseSetlistBackup("[]")).toBeNull();
    expect(parseSetlistBackup('"str"')).toBeNull();
    const sl = createSetlist({ name: "公演", templateId: "mini" });
    expect(parseSetlistBackup(JSON.stringify(sl))?.[0].name).toBe("公演");
    expect(parseSetlistBackup(JSON.stringify([sl, sl]))).toHaveLength(2);
    const round = parseSetlistBackup(setlistsToJSON([sl]));
    expect(round?.[0].items.map((i) => i.title)).toEqual(sl.items.map((i) => i.title));
  });
  it("mergeSetlists: 新しい方を採用", () => {
    const a = { ...createSetlist({ name: "A" }), id: "1", updatedAt: 1 };
    const b = { ...a, name: "A2", updatedAt: 2 };
    const c = { ...createSetlist({ name: "C" }), id: "3" };
    const r = mergeSetlists([a], [b, c, { ...a, updatedAt: 0 }]);
    expect(r).toMatchObject({ added: 1, updated: 1 });
    expect(r.list.map((s) => s.name)).toEqual(["A2", "C"]);
  });
});

describe("書き出し用の整形", () => {
  const sl = {
    ...createSetlist({ name: "公演", startTime: "13:00", theme: "近未来" }),
    items: [item("op", "オープニング", 90), item("song", "千本桜", 240, { producer: "黒うさP", bpm: 154, key: "Am", notes: "照明\n赤" }), item("mc", "MC①", 120)],
  };
  it("テキスト書き出し", () => {
    const text = setlistToText(sl);
    expect(text).toContain("【公演】");
    expect(text).toContain("13:01 1. 千本桜 / 黒うさP（BPM 154） 4:00 ※照明 赤");
    expect(text).toContain("13:00 [OP] オープニング 1:30");
  });
  it("TSV: セル内の改行・タブは空白に、列数が揃う", () => {
    const rows = setlistToTSV(sl).split("\n");
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.split("\t").length)).size).toBe(1);
    expect(rows[2]).toContain("照明 赤");
    expect(rows[2]).toContain("Am (8A)");
  });
});
