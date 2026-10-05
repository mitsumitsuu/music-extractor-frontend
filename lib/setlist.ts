// セトリ（セットリスト）の型と純粋関数（時間計算・BPM/Key の流れ・書き出し用の整形）
import { camelotOf, normalize, songKey } from "./parse";
import { newId } from "./storage";
import type { Song } from "./types";

export type SetlistItemType = "song" | "op" | "mc" | "ed" | "waiting" | "change" | "bgm" | "encore" | "custom";

export type SetlistItem = {
  id: string;
  type: SetlistItemType;
  /** 曲名、またはブロック名（例: MC①） */
  title: string;
  /** 長さ（秒） */
  duration: number;
  notes?: string;
  // 曲のみ
  producer?: string;
  vocal?: string;
  bpm?: number;
  key?: string;
  mmd?: Song["mmd"];
  url?: string;
  /** テンプレートの曲枠（まだ曲が決まっていない） */
  placeholder?: boolean;
};

export type Setlist = {
  id: string;
  /** 公演名 */
  name: string;
  /** YYYY-MM-DD（任意） */
  date?: string;
  theme?: string;
  /** 開始時刻 HH:MM（任意。指定すると各項目の開始時刻を時計で表示） */
  startTime?: string;
  items: SetlistItem[];
  createdAt: number;
  updatedAt: number;
};

export const ITEM_TYPES: { type: SetlistItemType; label: string; duration: number; defaultTitle: string }[] = [
  { type: "song", label: "曲", duration: 240, defaultTitle: "曲" },
  { type: "op", label: "OP", duration: 90, defaultTitle: "オープニング" },
  { type: "mc", label: "MC", duration: 120, defaultTitle: "MC" },
  { type: "ed", label: "ED", duration: 90, defaultTitle: "エンディング" },
  { type: "waiting", label: "待機動画", duration: 300, defaultTitle: "待機動画" },
  { type: "change", label: "転換", duration: 60, defaultTitle: "転換" },
  { type: "bgm", label: "BGM", duration: 180, defaultTitle: "BGM" },
  { type: "encore", label: "アンコール", duration: 60, defaultTitle: "アンコール" },
  { type: "custom", label: "カスタム", duration: 60, defaultTitle: "カスタム" },
];

const TYPE_INFO = Object.fromEntries(ITEM_TYPES.map((t) => [t.type, t])) as Record<SetlistItemType, (typeof ITEM_TYPES)[number]>;
export const typeLabel = (t: SetlistItemType) => TYPE_INFO[t]?.label ?? "カスタム";
export const defaultDuration = (t: SetlistItemType) => TYPE_INFO[t]?.duration ?? 60;

export const THEME_SUGGESTIONS = ["近未来", "電子空間", "夜空", "アイドル"];

/* ---------- 時間 ---------- */

const MAX_DURATION = 10 * 3600;

/**
 * 長さの入力を秒に変換。"4:00" "3:30" "1:02:03" "3分30秒" "90秒" "240s" "4"（=4分）"3.5"（=3分30秒）に対応。
 * 解釈できない・範囲外なら null。
 */
export function parseDuration(input: string): number | null {
  const s = normalize(input).replace(/\s+/g, "").toLowerCase();
  if (!s) return null;
  let sec: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/))) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] === undefined ? undefined : Number(m[3])];
    if (c === undefined) sec = b < 60 ? a * 60 + b : null;
    else sec = b < 60 && c < 60 ? a * 3600 + b * 60 + c : null;
  } else if ((m = s.match(/^(?:(\d+)時間)?(?:(\d+)分)?(?:(\d+)秒)?$/)) && (m[1] || m[2] || m[3])) {
    sec = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  } else if ((m = s.match(/^(\d+)(?:s|sec|秒)$/))) {
    sec = Number(m[1]);
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)(?:m|min|分)?$/))) {
    sec = Math.round(Number(m[1]) * 60);
  }
  if (sec === null || !Number.isFinite(sec) || sec < 0 || sec > MAX_DURATION) return null;
  return sec;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 秒 → "m:ss"（1時間以上は "h:mm:ss"） */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "13:00" → その日の 0:00 からの秒。不正なら null */
export function parseClock(input?: string): number | null {
  const m = normalize(input ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 3600 + min * 60;
}

/** その日の 0:00 からの秒 → "13:04"（24時を超えたら翌日扱いで折り返す） */
export function formatClock(secOfDay: number): string {
  const total = Math.floor(secOfDay / 60);
  const h = Math.floor(total / 60) % 24;
  return `${h}:${pad(total % 60)}`;
}

export type TimelineRow = { id: string; offset: number; start: string; end: string; songNo?: number };
export type Timeline = {
  rows: TimelineRow[];
  byId: Record<string, TimelineRow>;
  total: number;
  songCount: number;
  mcCount: number;
  blockCount: number;
  /** 開始時刻指定がある場合の終了時刻 */
  endClock?: string;
  startClock?: string;
};

/** 各項目の開始時刻（0:00 からの経過、または開始時刻からの時計）と合計を計算 */
export function computeTimeline(items: SetlistItem[], startTime?: string): Timeline {
  const base = parseClock(startTime);
  const fmt = (offset: number) => (base === null ? formatDuration(offset) : formatClock(base + offset));
  let offset = 0;
  let songNo = 0;
  let mcCount = 0;
  const rows: TimelineRow[] = items.map((it) => {
    const d = Math.max(0, it.duration || 0);
    const row: TimelineRow = { id: it.id, offset, start: fmt(offset), end: fmt(offset + d) };
    if (it.type === "song") row.songNo = ++songNo;
    if (it.type === "mc") mcCount++;
    offset += d;
    return row;
  });
  return {
    rows,
    byId: Object.fromEntries(rows.map((r) => [r.id, r])),
    total: offset,
    songCount: songNo,
    mcCount,
    blockCount: items.length - songNo,
    endClock: base === null ? undefined : formatClock(base + offset),
    startClock: base === null ? undefined : formatClock(base),
  };
}

/* ---------- チェック ---------- */

export const itemKey = (it: Pick<SetlistItem, "title">) => songKey(it.title);
const isRealSong = (it: SetlistItem) => it.type === "song" && !it.placeholder && !!itemKey(it);

/** 同じセトリ内で重複している曲（全出現の id）と、その曲名一覧 */
export function findDuplicates(items: SetlistItem[]): { ids: Set<string>; titles: string[] } {
  const groups = new Map<string, SetlistItem[]>();
  for (const it of items) {
    if (!isRealSong(it)) continue;
    const k = itemKey(it);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const ids = new Set<string>();
  const titles: string[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    titles.push(g[0].title);
    for (const it of g) ids.add(it.id);
  }
  return { ids, titles };
}

/** 演奏済みリストに含まれる曲 */
export function findPerformed(items: SetlistItem[], performedKeys: Set<string>): { ids: Set<string>; titles: string[] } {
  const ids = new Set<string>();
  const titles: string[] = [];
  for (const it of items) {
    if (!isRealSong(it) || !performedKeys.has(itemKey(it))) continue;
    ids.add(it.id);
    if (!titles.includes(it.title)) titles.push(it.title);
  }
  return { ids, titles };
}

/* ---------- BPM / Key の流れ ---------- */

export type FlowPoint = { id: string; songNo: number; title: string; bpm: number };
export type FlowJump = { from: FlowPoint; to: FlowPoint; delta: number };

/** 曲の BPM 推移（BPM 不明の曲・曲以外の項目は飛ばす）。隣り合う点の差が threshold 以上なら jumps に入れる */
export function bpmFlow(items: SetlistItem[], threshold = 40): { points: FlowPoint[]; jumps: FlowJump[]; songTotal: number; unknown: number } {
  const points: FlowPoint[] = [];
  let songNo = 0;
  let unknown = 0;
  for (const it of items) {
    if (it.type !== "song") continue;
    songNo++;
    if (typeof it.bpm === "number" && Number.isFinite(it.bpm) && it.bpm > 0) points.push({ id: it.id, songNo, title: it.title, bpm: it.bpm });
    else unknown++;
  }
  const jumps: FlowJump[] = [];
  for (let i = 1; i < points.length; i++) {
    const delta = Math.round((points[i].bpm - points[i - 1].bpm) * 10) / 10;
    if (Math.abs(delta) >= threshold) jumps.push({ from: points[i - 1], to: points[i], delta });
  }
  return { points, jumps, songTotal: songNo, unknown };
}

export type KeyRelation = "same" | "near" | "far" | "unknown";
export type KeyStep = { songNo: number; title: string; key?: string; camelot?: string };
export type KeyTransition = { from: KeyStep; to: KeyStep; relation: KeyRelation; /** 間に MC など曲以外の項目を挟まない */ adjacent: boolean };

/** Camelot 同士の相性: 同じ=same / 隣(±1)・平行調(A⇔B)=near / それ以外=far */
export function camelotRelation(a?: string, b?: string): KeyRelation {
  const pa = a?.match(/^(\d{1,2})([AB])$/), pb = b?.match(/^(\d{1,2})([AB])$/);
  if (!pa || !pb) return "unknown";
  const na = Number(pa[1]), nb = Number(pb[1]);
  if (na === nb && pa[2] === pb[2]) return "same";
  if (na === nb) return "near";
  const diff = Math.abs(na - nb);
  if (pa[2] === pb[2] && (diff === 1 || diff === 11)) return "near";
  return "far";
}

/** 連続する曲同士の Key の移り変わり（Key 不明でも曲順は保つ） */
export function keyFlow(items: SetlistItem[]): KeyTransition[] {
  const out: KeyTransition[] = [];
  let prev: KeyStep | null = null;
  let songNo = 0;
  let gap = false;
  for (const it of items) {
    if (it.type !== "song") { gap = true; continue; }
    songNo++;
    const step: KeyStep = { songNo, title: it.title, key: it.key, camelot: camelotOf(it.key) };
    if (prev) out.push({ from: prev, to: step, relation: camelotRelation(prev.camelot, step.camelot), adjacent: !gap });
    prev = step;
    gap = false;
  }
  return out;
}

/* ---------- 項目の作成 ---------- */

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const circled = (n: number) => (n >= 1 && n <= 20 ? CIRCLED[n - 1] : ` ${n}`);

/** ブロック（OP/MC/ED…）を作る。MC は既存の数に応じて MC① MC② … と番号を振る */
export function createBlock(type: Exclude<SetlistItemType, "song">, existing: SetlistItem[] = [], title?: string): SetlistItem {
  const info = TYPE_INFO[type];
  const auto = type === "mc" ? `MC${circled(existing.filter((i) => i.type === "mc").length + 1)}` : info.defaultTitle;
  return { id: newId(), type, title: title?.trim() || auto, duration: info.duration };
}

export function createSongItem(s: { title: string; producer?: string; vocal?: string; bpm?: number; key?: string; mmd?: Song["mmd"]; url?: string }, duration = defaultDuration("song")): SetlistItem {
  return {
    id: newId(),
    type: "song",
    title: s.title.trim(),
    duration,
    producer: s.producer?.trim() || undefined,
    vocal: s.vocal?.trim() || undefined,
    bpm: typeof s.bpm === "number" && s.bpm > 0 ? s.bpm : undefined,
    key: s.key?.trim() || undefined,
    mmd: s.mmd,
    url: s.url,
  };
}

export const songToItem = (s: Song) => createSongItem(s);

export function placeholderSong(n: number): SetlistItem {
  return { id: newId(), type: "song", title: `（曲枠${n}）`, duration: defaultDuration("song"), placeholder: true };
}

/** 曲の項目をセトリに入れる。テンプレートの曲枠を先に埋め、余りは最後の曲の後ろ（なければ末尾）に追加 */
export function insertSongItems(setlist: Setlist, songItems: SetlistItem[], now = Date.now()): { setlist: Setlist; filled: number; added: number } {
  const items = [...setlist.items];
  const queue = [...songItems];
  let filled = 0;
  for (let i = 0; i < items.length && queue.length; i++) {
    if (items[i].type === "song" && items[i].placeholder) {
      const next = queue.shift()!;
      items[i] = { ...next, id: items[i].id, duration: items[i].duration, notes: items[i].notes };
      filled++;
    }
  }
  const added = queue.length;
  if (queue.length) {
    let lastSong = -1;
    items.forEach((it, i) => { if (it.type === "song") lastSong = i; });
    const at = lastSong >= 0 ? lastSong + 1 : items.length;
    items.splice(at, 0, ...queue);
  }
  return { setlist: { ...setlist, items, updatedAt: now }, filled, added };
}

/** 抽出結果の曲をセトリに入れる */
export const addSongsToSetlist = (setlist: Setlist, songs: Song[], now = Date.now()) => insertSongItems(setlist, songs.map(songToItem), now);

/* ---------- テンプレート ---------- */

type Step = SetlistItemType | ["song", number];
export const TEMPLATES: { id: string; name: string; desc: string; steps: Step[] }[] = [
  { id: "standard", name: "定番（曲8・MC2）", desc: "OP → 曲×3 → MC → 曲×3 → MC → 曲×2 → ED", steps: ["op", ["song", 3], "mc", ["song", 3], "mc", ["song", 2], "ed"] },
  { id: "mini", name: "ミニライブ（曲4）", desc: "OP → 曲×2 → MC → 曲×2 → ED", steps: ["op", ["song", 2], "mc", ["song", 2], "ed"] },
  { id: "full", name: "フル（曲12＋アンコール）", desc: "待機動画 → OP → 曲×4 → MC → 曲×4 → 転換 → 曲×2 → MC → ED → アンコール → 曲×2", steps: ["waiting", "op", ["song", 4], "mc", ["song", 4], "change", ["song", 2], "mc", "ed", "encore", ["song", 2]] },
  { id: "empty", name: "空のセトリ", desc: "項目なしで始める", steps: [] },
];

export function buildTemplateItems(templateId: string): SetlistItem[] {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0];
  const items: SetlistItem[] = [];
  let slot = 0;
  for (const step of t.steps) {
    if (Array.isArray(step)) for (let i = 0; i < step[1]; i++) items.push(placeholderSong(++slot));
    else if (step === "song") items.push(placeholderSong(++slot));
    else items.push(createBlock(step, items));
  }
  return items;
}

export function createSetlist(opts: { name?: string; templateId?: string; date?: string; theme?: string; startTime?: string } = {}, now = Date.now()): Setlist {
  return {
    id: newId(),
    name: opts.name?.trim().slice(0, 60) || "新しいセトリ",
    date: opts.date || undefined,
    theme: opts.theme?.trim() || undefined,
    startTime: opts.startTime || undefined,
    items: buildTemplateItems(opts.templateId ?? "empty"),
    createdAt: now,
    updatedAt: now,
  };
}

/* ---------- 保存データの検証 ---------- */

const TYPES = new Set<SetlistItemType>(ITEM_TYPES.map((t) => t.type));
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export function sanitizeItem(raw: unknown): SetlistItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title);
  if (!title) return null;
  const type = TYPES.has(r.type as SetlistItemType) ? (r.type as SetlistItemType) : "custom";
  const duration = typeof r.duration === "number" && Number.isFinite(r.duration) ? Math.min(MAX_DURATION, Math.max(0, Math.round(r.duration))) : defaultDuration(type);
  const item: SetlistItem = { id: str(r.id, 40) ?? newId(), type, title, duration };
  const notes = str(r.notes, 1000);
  if (notes) item.notes = notes;
  if (type === "song") {
    item.producer = str(r.producer);
    item.vocal = str(r.vocal);
    item.bpm = typeof r.bpm === "number" && r.bpm > 0 && r.bpm < 1000 ? r.bpm : undefined;
    item.key = str(r.key, 20);
    item.mmd = r.mmd === "あり" || r.mmd === "なし" || r.mmd === "不明" ? r.mmd : undefined;
    item.url = typeof r.url === "string" && /^https?:\/\//i.test(r.url) ? r.url : undefined;
    if (r.placeholder === true) item.placeholder = true;
    for (const k of ["producer", "vocal", "bpm", "key", "mmd", "url"] as const) if (item[k] === undefined) delete item[k];
  }
  return item;
}

export function sanitizeSetlist(raw: unknown, now = Date.now()): Setlist | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items.map(sanitizeItem).filter((x): x is SetlistItem => !!x).slice(0, 300) : [];
  // id の重複（コピー＆ペーストした JSON 等）を解消
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) it.id = newId();
    seen.add(it.id);
  }
  const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : undefined;
  const startTime = typeof r.startTime === "string" && parseClock(r.startTime) !== null ? r.startTime : undefined;
  return {
    id: str(r.id, 40) ?? newId(),
    name: str(r.name, 60) ?? "読み込んだセトリ",
    date,
    theme: str(r.theme, 60),
    startTime,
    items,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
  };
}

/** バックアップから読み込んだセトリを手元のものと統合（同じ id は新しい方を採用） */
export function mergeSetlists(current: Setlist[], incoming: Setlist[]): { list: Setlist[]; added: number; updated: number } {
  const list = [...current];
  let added = 0, updated = 0;
  for (const s of incoming) {
    const i = list.findIndex((x) => x.id === s.id);
    if (i < 0) { list.push(s); added++; }
    else if (s.updatedAt > list[i].updatedAt) { list[i] = s; updated++; }
  }
  return { list, added, updated };
}

/* ---------- 書き出し用の整形 ---------- */

export const SETLIST_COLUMNS = ["No", "種別", "曲名", "ボカロP", "合成音声", "BPM", "Key", "MMD", "長さ", "開始", "メモ"] as const;

export function setlistRows(sl: Setlist): (string | number)[][] {
  const tl = computeTimeline(sl.items, sl.startTime);
  return sl.items.map((it, i) => {
    const song = it.type === "song";
    const cam = song ? camelotOf(it.key) : undefined;
    return [
      i + 1,
      typeLabel(it.type),
      it.title,
      song ? it.producer ?? "" : "",
      song ? it.vocal ?? "" : "",
      song && it.bpm ? it.bpm : "",
      song && it.key ? (cam ? `${it.key} (${cam})` : it.key) : "",
      song ? it.mmd ?? "" : "",
      formatDuration(it.duration),
      tl.byId[it.id]?.start ?? "",
      it.notes ?? "",
    ];
  });
}

const oneLine = (v: unknown) => String(v ?? "").replace(/[\t\r\n]+/g, " ");

export function setlistToTSV(sl: Setlist): string {
  return [SETLIST_COLUMNS.join("\t"), ...setlistRows(sl).map((r) => r.map(oneLine).join("\t"))].join("\n");
}

export function setlistSummary(sl: Setlist): string {
  const tl = computeTimeline(sl.items, sl.startTime);
  const range = tl.startClock ? `（${tl.startClock}〜${tl.endClock}）` : "";
  return `合計 ${formatDuration(tl.total)}${range}・曲 ${tl.songCount}・MC ${tl.mcCount}`;
}

/** 「1. 曲名 / P名（BPM 150）4:00」形式のテキスト */
export function setlistToText(sl: Setlist): string {
  const tl = computeTimeline(sl.items, sl.startTime);
  const head = [`【${sl.name}】${[sl.date, sl.theme ? `テーマ: ${sl.theme}` : ""].filter(Boolean).join(" ")}`.trim(), setlistSummary(sl), ""];
  const lines = sl.items.map((it) => {
    const row = tl.byId[it.id];
    const time = tl.startClock ? `${row.start} ` : "";
    const note = it.notes ? ` ※${oneLine(it.notes)}` : "";
    if (it.type === "song") {
      const who = it.producer ? ` / ${it.producer}` : "";
      const bpm = it.bpm ? `（BPM ${it.bpm}）` : "";
      return `${time}${row.songNo}. ${it.title}${who}${bpm} ${formatDuration(it.duration)}${note}`;
    }
    const label = typeLabel(it.type);
    const name = it.title === label ? "" : ` ${it.title}`;
    return `${time}[${label}]${name} ${formatDuration(it.duration)}${note}`;
  });
  return [...head, ...lines].join("\n");
}

/* ---------- JSON バックアップ ---------- */

export const SETLIST_BACKUP_KIND = "mx-setlists";

export function setlistsToJSON(list: Setlist[]): string {
  return JSON.stringify({ kind: SETLIST_BACKUP_KIND, version: 1, exportedAt: new Date().toISOString(), setlists: list }, null, 2);
}

/** バックアップ JSON（{setlists:[…]}・セトリ配列・セトリ1件のいずれも可）を読み込む。読めなければ null */
export function parseSetlistBackup(text: string, now = Date.now()): Setlist[] | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  const arr = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { setlists?: unknown }).setlists) ? (raw as { setlists: unknown[] }).setlists : raw && typeof raw === "object" && "items" in raw ? [raw] : null;
  if (!arr) return null;
  const out = arr.map((x) => sanitizeSetlist(x, now)).filter((x): x is Setlist => !!x);
  return out.length ? out.slice(0, 100) : null;
}

/** 項目の複製（id を振り直し、タイトルは同じまま）。placeholder・メモも引き継ぐ */
export function cloneItem(it: SetlistItem): SetlistItem {
  return { ...it, id: newId() };
}

/** 配列内の移動（範囲外なら同じ配列を返す） */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const a = arr.slice();
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

/** セトリを複製（新しい id・名前に「のコピー」） */
export function cloneSetlist(sl: Setlist, now = Date.now()): Setlist {
  return { ...sl, id: newId(), name: `${sl.name} のコピー`.slice(0, 60), items: sl.items.map(cloneItem), createdAt: now, updatedAt: now };
}
