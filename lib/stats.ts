// 抽出結果の統計・ランダムピック（純粋関数）
import type { Song } from "./types";

export type CountRow = { label: string; count: number };

/** 合成音声・ボカロP の集計。複数人（「・」「、」「&」「×」区切り）は各人にカウント。未設定は unknown に数える */
export function countBy(songs: Song[], pick: (s: Song) => string | undefined, splitRe: RegExp, top = 8): { rows: CountRow[]; unknown: number; distinct: number } {
  const m = new Map<string, number>();
  let unknown = 0;
  for (const s of songs) {
    const names = [...new Set((pick(s) ?? "").split(splitRe).map((x) => x.trim()).filter(Boolean))];
    if (!names.length) { unknown++; continue; }
    for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  }
  const rows = [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja"));
  return { rows: rows.slice(0, top), unknown, distinct: rows.length };
}

export const VOCAL_SPLIT = /[・、,，&＆×]|\s+x\s+/i;
export const PRODUCER_SPLIT = /[、,，&＆×]|\s+x\s+/i;

export type BpmBin = { from: number; to: number; count: number };

/** BPM のヒストグラム（bin 刻み。最小〜最大の間は 0 件の階級も含める） */
export function bpmHistogram(songs: Song[], bin = 10): { bins: BpmBin[]; known: number; unknown: number; min?: number; max?: number; avg?: number } {
  const vals = songs.map((s) => s.bpm).filter((b): b is number => typeof b === "number" && Number.isFinite(b) && b > 0);
  const unknown = songs.length - vals.length;
  if (!vals.length) return { bins: [], known: 0, unknown };
  const min = Math.min(...vals), max = Math.max(...vals);
  const first = Math.floor(min / bin) * bin, last = Math.floor(max / bin) * bin;
  const bins: BpmBin[] = [];
  for (let f = first; f <= last; f += bin) bins.push({ from: f, to: f + bin - 1, count: 0 });
  for (const v of vals) bins[Math.floor(v / bin) - first / bin].count++;
  return { bins, known: vals.length, unknown, min, max, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 };
}

export function mmdRatio(songs: Song[]): { yes: number; no: number; unknown: number; total: number; ratio: number } {
  let yes = 0, no = 0;
  for (const s of songs) { if (s.mmd === "あり") yes++; else if (s.mmd === "なし") no++; }
  const total = songs.length;
  return { yes, no, unknown: total - yes - no, total, ratio: total ? yes / total : 0 };
}

/** 重複なしで n 曲をランダムに選ぶ（元の並びは変えない）。rng は 0以上1未満を返す関数 */
export function pickRandom<T>(items: T[], n: number, rng: () => number = Math.random): T[] {
  const k = Math.max(0, Math.min(items.length, Math.floor(Number.isFinite(n) ? n : 0)));
  const a = items.slice();
  for (let i = 0; i < k; i++) {
    const j = i + Math.min(a.length - i - 1, Math.floor(rng() * (a.length - i)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}
