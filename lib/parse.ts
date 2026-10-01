// 楽曲情報の解析・フィルタ・リンク生成（純粋関数のみ。サーバー/ブラウザ両対応）
import type { Filters, LinkOptions, Song } from "./types";

/** 全角英数・記号を半角に、空白を正規化 */
export function normalize(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 全角数字を含む文字列から数値のみ取り出す（空なら ""） */
export function toNumberOrEmpty(v: string): number | "" {
  const s = normalize(v).replace(/[^0-9]/g, "");
  return s === "" ? "" : Number.parseInt(s, 10);
}

/** 重複判定用キー */
export function songKey(title: string): string {
  return normalize(title)
    .toLowerCase()
    .replace(/[\s"'「」『』【】\[\]()（）・,、.。!！?？~〜\-_/]/g, "");
}

const KNOWN_VOCALS = [
  "初音ミク", "鏡音リン", "鏡音レン", "巡音ルカ", "MEIKO", "KAITO", "GUMI", "IA", "OÑE", "flower", "v flower",
  "結月ゆかり", "東北きりたん", "重音テト", "可不", "星界", "裏命", "羽累", "知声", "足立レイ", "ずんだもん",
  "歌愛ユキ", "音街ウナ", "Fukase", "心華", "CeVIO", "SynthV", "Synthesizer V", "小春六花", "夏色花梨", "花隈千冬",
  "VOCALOID", "UTAU", "ミク", "リン", "レン", "ルカ", "テト",
];

const NOISE = [
  /【[^】]*(MV|PV|オリジナル|original|公式|official|ボカロ|VOCALOID|cover|カバー|歌ってみた)[^】]*】/gi,
  /\[[^\]]*(MV|PV|official|original)[^\]]*\]/gi,
  /\((Official|MV|PV|Music Video|Lyric Video)[^)]*\)/gi,
  /(Official\s*)?(Music\s*Video|Lyric\s*Video|MV|PV)$/i,
];

/** "1位", "01.", "#3", "No.5" などのランキング接頭辞を除去 */
function stripRank(line: string): string {
  return line
    .replace(/^\s*(第?\s*\d{1,4}\s*(位|\.|．|:|：|\)|）|、|\s-\s)|#\d{1,4}\s*|No\.?\s*\d{1,4}\s*|[①-⑳]\s*)/i, "")
    .replace(/^[-・●○◆◇■□★☆*>\s]+/, "")
    .trim();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "IA" が "Official" に、"リン" が "リンク" に誤反応しないよう、前後の文字を確認する
const VOCAL_RES = KNOWN_VOCALS.map((v) => {
  const ascii = /^[\x20-\x7e]+$/.test(v);
  if (ascii) return { v, re: new RegExp(`(?<![A-Za-z])${esc(v)}(?![A-Za-z])`, v.length <= 4 ? "" : "i") };
  return { v, re: new RegExp(`(?<![ァ-ヶー])${esc(v)}(?![ァ-ヶー])`) };
});

function findVocals(s: string): string[] {
  const found: string[] = [];
  for (const { v, re } of VOCAL_RES) {
    if (re.test(s) && !found.some((f) => f.includes(v) || v.includes(f))) found.push(v);
  }
  return found;
}

/**
 * 動画タイトルやランキング1行から「曲名 / P名 / 合成音声」を推定する（AIなしの高速モード用）
 * 例: "ロキ / みきとP feat. 鏡音リン・みきとP" "【初音ミク】千本桜【オリジナル】" "DECO*27 - ヴァンパイア feat. 初音ミク"
 */
export function parseTitleLine(raw: string, channel?: string): { title: string; producer?: string; vocal?: string } | null {
  let line = stripRank(normalize(raw));
  if (!line || line.length < 1) return null;
  if (/^https?:\/\//i.test(line)) return null;

  // feat./ft. の歌唱者
  let vocal: string | undefined;
  const feat = line.match(/\s(?:feat\.?|ft\.?|ｆｅａｔ)\s*(.+)$/i);
  if (feat) {
    vocal = feat[1].replace(/[)\]）】].*$/, "").trim();
    line = line.slice(0, feat.index).trim();
  }

  // 【初音ミク】のような括弧内の歌唱者
  const brackets = [...line.matchAll(/【([^】]+)】/g)].map((m) => m[1]);
  for (const b of brackets) {
    const vs = findVocals(b);
    if (vs.length && !vocal) vocal = vs.join("・");
  }
  for (const re of NOISE) line = line.replace(re, " ");
  line = line.replace(/【[^】]*】/g, " ").replace(/\s+/g, " ").trim();

  let title = line;
  let producer: string | undefined;

  // "曲名 / P名" or "曲名 ／ P名"
  const slash = line.split(/\s*[\/／]\s*/);
  if (slash.length >= 2 && slash[0] && slash[1]) {
    title = slash[0];
    producer = slash.slice(1).join(" / ");
  } else {
    // "P名 - 曲名"（チャンネル名と一致する方を P とみなす）
    const dash = line.split(/\s+[-–—]\s+/);
    if (dash.length === 2) {
      if (channel && normalize(dash[0]).includes(normalize(channel).replace(/\s*-\s*Topic$/i, ""))) {
        producer = dash[0];
        title = dash[1];
      } else {
        title = dash[1];
        producer = dash[0];
      }
    }
  }

  // 「曲名」『曲名』表記
  const quoted = title.match(/[「『]([^」』]+)[」』]/);
  if (quoted) title = quoted[1];

  title = title.replace(/^["'\s]+|["'\s]+$/g, "").trim();
  if (!producer && channel) producer = channel.replace(/\s*-\s*Topic$/i, "").trim();
  if (!vocal) {
    const vs = findVocals(raw);
    if (vs.length) vocal = vs.join("・");
  }
  if (!title || title.length > 120) return null;
  return { title, producer: producer || undefined, vocal: vocal || undefined };
}

/** 貼り付けテキストから楽曲行を抽出（見出しや空行・URLのみ行を除外） */
export function parseTextBlock(text: string): { title: string; producer?: string; vocal?: string; url?: string }[] {
  const out: { title: string; producer?: string; vocal?: string; url?: string }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(ランキング|順位|曲名|タイトル|title|rank)[\s,\t]/i.test(line)) continue;
    const urlMatch = line.match(/https?:\/\/\S+/);
    const withoutUrl = line.replace(/https?:\/\/\S+/g, "").replace(/\t+/g, " / ").trim();
    if (!withoutUrl) continue;
    // CSV 行（カンマ区切り）なら先頭列を曲名、2列目をP名として扱う
    let parsed: ReturnType<typeof parseTitleLine>;
    const cols = rawLine.includes("\t") ? rawLine.split("\t") : rawLine.split(",");
    if (cols.length >= 2 && !/[\/／]/.test(cols[0]) && cols[0].trim() && !/^\d+$/.test(cols[0].trim())) {
      parsed = { title: stripRank(normalize(cols[0].replace(/^"|"$/g, ""))), producer: normalize(cols[1].replace(/^"|"$/g, "")) || undefined };
      if (/^https?:/.test(parsed.producer ?? "")) parsed.producer = undefined;
    } else {
      parsed = parseTitleLine(withoutUrl);
    }
    if (parsed && parsed.title) out.push({ ...parsed, url: urlMatch?.[0] });
  }
  return out;
}

/** YouTube の動画ID・プレイリストIDを抽出 */
export function parseYouTube(url: string): { videoId?: string; listId?: string } {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
    if (host === "youtu.be") return { videoId: u.pathname.slice(1, 12) || undefined, listId: u.searchParams.get("list") || undefined };
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      const list = u.searchParams.get("list") || undefined;
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      return { videoId: v || m?.[1] || undefined, listId: list };
    }
  } catch {
    /* not a URL */
  }
  return {};
}

export function extractVideoIds(text: string): string[] {
  const ids: string[] = [];
  const re = /(?:youtube\.com\/(?:watch\?[^\s"']*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/g;
  for (const m of text.matchAll(re)) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

/** 50件ずつ YouTube の匿名プレイリストURLを作る */
export function buildYouTubePlaylistUrls(ids: string[]): string[] {
  const urls: string[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    urls.push(`https://www.youtube.com/watch_videos?video_ids=${ids.slice(i, i + 50).join(",")}`);
  }
  return urls;
}

/** 曲ごとの外部リンクを生成（歌詞: Uta-Net / 考察: 初音ミクWiki / BPM・Key: Tunebat） */
export function buildLinks(s: Pick<Song, "title" | "producer" | "url">, opt: LinkOptions): Song["links"] {
  const q = (x: string) => encodeURIComponent(x);
  const base = s.producer ? `${s.title} ${s.producer}` : s.title;
  return {
    youtube: s.url || `https://www.youtube.com/results?search_query=${q(base)}`,
    lyrics: opt.lyrics ? `https://www.uta-net.com/search/?Aselect=2&Keyword=${q(s.title)}` : undefined,
    analysis: opt.analysis ? `https://w.atwiki.jp/hmiku/search?andor=and&keyword=${q(s.title)}` : undefined,
    tunebat: opt.tunebat ? `https://tunebat.com/Search?q=${q(base)}` : undefined,
  };
}

/** 動画の概要欄から BPM / Key / MMD 情報を拾う（旧バックエンドの機能を移植） */
export function parseDescription(desc?: string): { bpm?: number; key?: string; mmd?: "あり" } {
  if (!desc) return {};
  const d = normalize(desc);
  const bpm = d.match(/BPM\s*[:：=]?\s*(\d{2,3})/i)?.[1];
  const key = d.match(/\bKey\s*[:：=]\s*([A-G][#b♯♭]?\s*(?:m(?:inor)?|maj(?:or)?)?|\d{1,2}[AB])\b/i)?.[1];
  return {
    bpm: bpm && +bpm >= 40 && +bpm <= 300 ? +bpm : undefined,
    key: key?.replace(/\s+/g, "") || undefined,
    mmd: /(\bMMD\b|モーション配布|モデル配布|bowlroll)/i.test(d) ? "あり" : undefined,
  };
}

const KEY_ALIASES: Record<string, string> = {
  "1a": "abm", "2a": "ebm", "3a": "bbm", "4a": "fm", "5a": "cm", "6a": "gm", "7a": "dm", "8a": "am", "9a": "em", "10a": "bm", "11a": "f#m", "12a": "dbm",
  "1b": "b", "2b": "f#", "3b": "db", "4b": "ab", "5b": "eb", "6b": "bb", "7b": "f", "8b": "c", "9b": "g", "10b": "d", "11b": "a", "12b": "e",
};
function normKey(k: string): string {
  let s = normalize(k).toLowerCase().replace(/\s|major|maj/g, "").replace(/minor|min/g, "m").replace("♯", "#").replace("♭", "b");
  if (KEY_ALIASES[s]) s = KEY_ALIASES[s];
  const enh: Record<string, string> = { "c#": "db", "d#": "eb", "g#": "ab", "a#": "bb", gb: "f#", "c#m": "dbm", "d#m": "ebm", "g#m": "abm", "a#m": "bbm", gbm: "f#m" };
  return enh[s] ?? s;
}

const splitWords = (s: string) => normalize(s).split(/[,、，]\s*/).map((w) => w.trim()).filter(Boolean);

/** フィルタ適用。除外理由を集計して返す */
export function applyFilters(songs: Song[], f: Filters, strictStats: boolean): { kept: Song[]; dropped: Record<string, number> } {
  const dropped: Record<string, number> = {};
  const drop = (reason: string) => { dropped[reason] = (dropped[reason] ?? 0) + 1; return false; };
  const ex = splitWords(f.excludeWords).map((w) => w.toLowerCase());
  const vocals = splitWords(f.vocal).map((w) => w.toLowerCase());
  const producers = splitWords(f.producer).map((w) => w.toLowerCase());
  const num = (v: number | "") => (v === "" ? 0 : v);

  const kept = songs.filter((s) => {
    const hay = `${s.title} ${s.producer ?? ""} ${s.vocal ?? ""}`.toLowerCase();
    if (ex.length && ex.some((w) => hay.includes(w))) return drop("除外ワード");
    if (vocals.length && !vocals.some((w) => (s.vocal ?? s.title).toLowerCase().includes(w))) return drop("ボカロ指定");
    if (producers.length && !producers.some((w) => (s.producer ?? "").toLowerCase().includes(w))) return drop("P指定");
    if (f.multiOnly && !(s.vocal && /[・、,&×x＆]|\sand\s/i.test(s.vocal))) return drop("複数人歌唱でない");
    if (f.requireMmd && s.mmd !== "あり") return drop("MMDなし/不明");
    if (f.bpm !== "" && f.bpm > 0) {
      if (!s.bpm) return drop("BPM不明");
      if (Math.abs(s.bpm - f.bpm) > 3) return drop("BPM不一致");
    }
    if (f.key.trim()) {
      if (!s.key) return drop("Key不明");
      if (normKey(s.key) !== normKey(f.key)) return drop("Key不一致");
    }
    const minV = num(f.minViews), maxV = num(f.maxViews), minC = num(f.minComments), maxC = num(f.maxComments);
    if (minV || maxV) {
      if (s.views === undefined) { if (strictStats) return drop("再生数不明"); }
      else if (s.views < minV || (maxV > 0 && s.views > maxV)) return drop("再生数範囲外");
    }
    if (minC || maxC) {
      if (s.comments === undefined) { if (strictStats) return drop("コメント数不明"); }
      else if (s.comments < minC || (maxC > 0 && s.comments > maxC)) return drop("コメント数範囲外");
    }
    return true;
  });
  return { kept, dropped };
}

/** タイトル基準で重複を統合（情報が多い方を優先して埋める） */
export function dedupe(songs: Song[]): Song[] {
  const map = new Map<string, Song>();
  for (const s of songs) {
    const k = songKey(s.title);
    if (!k) continue;
    const prev = map.get(k);
    if (!prev) { map.set(k, s); continue; }
    map.set(k, {
      ...prev,
      producer: prev.producer ?? s.producer,
      vocal: prev.vocal ?? s.vocal,
      bpm: prev.bpm ?? s.bpm,
      key: prev.key ?? s.key,
      mmd: prev.mmd && prev.mmd !== "不明" ? prev.mmd : s.mmd,
      url: prev.url ?? s.url,
      views: Math.max(prev.views ?? 0, s.views ?? 0) || undefined,
      comments: Math.max(prev.comments ?? 0, s.comments ?? 0) || undefined,
    });
  }
  return [...map.values()];
}

/** CSV の1セルをエスケープ（Excel の数式インジェクション対策込み） */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function xmlEscape(v: unknown): string {
  return String(v ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}
