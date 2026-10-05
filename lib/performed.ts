// 演奏済みリスト（過去の公演で演奏した曲）。貼り付けたテキストをそのまま保存し、曲名キーで照合する
import { normalize, songKey } from "./parse";

export type PerformedEntry = { title: string; producer?: string; key: string };

export const MAX_PERFORMED_TEXT = 200_000;

/** 1行 →「曲名 / P名」。番号・箇条書き・「（BPM 150）」「4:00」「※メモ」を取り除く */
export function parsePerformedLine(raw: string): { title: string; producer?: string } | null {
  const cleaned = raw
    .replace(/^\s*\d{1,2}:\d{2}\s+(?=\S)/, "") // 開始時刻付きのセトリ書き出し
    .replace(/^\s*(?:\d{1,3}\s*[.)．、:：]\s*|[-・●○◆*]\s+)/, "")
    .replace(/\s*※.*$/, "")
    .replace(/[（(]\s*BPM\s*[\d.]+\s*[）)]/gi, " ")
    .replace(/\s+\d{1,3}:\d{2}(?::\d{2})?\s*$/, "")
    .trim();
  if (!cleaned || cleaned.startsWith("#")) return null;
  if (/^\[[^\]]*]/.test(cleaned)) return null; // セトリのテキスト書き出しにある「[MC] …」などのブロック行
  const parts = cleaned.split(/\s+[/／|｜]\s+|\s*／\s*|\t+/).map((p) => p.trim()).filter(Boolean);
  const title = parts[0];
  if (!title || !songKey(title)) return null;
  const producer = parts.slice(1).join(" / ") || undefined;
  return { title, producer };
}

/** テキスト全体を解析（曲名キーの重複は最初の1件にまとめる） */
export function parsePerformed(text: string): PerformedEntry[] {
  const seen = new Set<string>();
  const out: PerformedEntry[] = [];
  for (const line of normalizeNewlines(text).split("\n")) {
    const e = parsePerformedLine(line);
    if (!e) continue;
    const key = songKey(e.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...e, key });
  }
  return out;
}

const normalizeNewlines = (t: string) => t.replace(/\r\n?/g, "\n");

export const performedKeySet = (text: string): Set<string> => new Set(parsePerformed(text).map((e) => e.key));

/** 演奏済みリストの末尾に曲を追記（既にある曲は追加しない）。追加した件数も返す */
export function appendPerformed(text: string, songs: { title: string; producer?: string }[]): { text: string; added: number } {
  const keys = performedKeySet(text);
  const lines: string[] = [];
  for (const s of songs) {
    const title = normalize(s.title);
    const k = songKey(title);
    if (!k || keys.has(k)) continue;
    keys.add(k);
    lines.push(s.producer ? `${title} / ${s.producer}` : title);
  }
  if (!lines.length) return { text, added: 0 };
  const base = text.replace(/\s+$/, "");
  return { text: (base ? base + "\n" : "") + lines.join("\n") + "\n", added: lines.length };
}
