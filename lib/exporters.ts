// 抽出結果の書き出し（ブラウザ専用）
import { csvCell, xmlEscape, buildYouTubePlaylistUrls, parseYouTube } from "./parse";
import { SETLIST_COLUMNS, setlistRows, setlistsToJSON, type Setlist } from "./setlist";
import type { Song } from "./types";

const COLS: { label: string; get: (s: Song) => string | number | undefined }[] = [
  { label: "曲名", get: (s) => s.title },
  { label: "ボカロP", get: (s) => s.producer },
  { label: "合成音声", get: (s) => s.vocal },
  { label: "BPM", get: (s) => s.bpm },
  { label: "Key", get: (s) => s.key },
  { label: "MMD", get: (s) => s.mmd },
  { label: "再生数", get: (s) => s.views },
  { label: "コメント数", get: (s) => s.comments },
  { label: "URL", get: (s) => s.url ?? s.links.youtube },
];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safeName = (n: string) => (n || "playlist").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);

export function exportCSV(songs: Song[], name: string) {
  const lines = [COLS.map((c) => csvCell(c.label)).join(","), ...songs.map((s) => COLS.map((c) => csvCell(c.get(s))).join(","))];
  download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${safeName(name)}.csv`);
}

export async function exportXLSX(songs: Song[], name: string) {
  const XLSX = await import("xlsx");
  const rows = songs.map((s) => Object.fromEntries(COLS.map((c) => [c.label, c.get(s) ?? ""])));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 44 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Playlist");
  XLSX.writeFile(wb, `${safeName(name)}.xlsx`);
}

export function toTSV(songs: Song[]): string {
  const clean = (v: unknown) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  return [COLS.map((c) => c.label).join("\t"), ...songs.map((s) => COLS.map((c) => clean(c.get(s))).join("\t"))].join("\n");
}

export function exportM3U8(songs: Song[], name: string) {
  const body = ["#EXTM3U", ...songs.flatMap((s) => [`#EXTINF:-1,${s.producer ? `${s.producer} - ` : ""}${s.title}`, s.url ?? s.links.youtube])].join("\n");
  download(new Blob([body], { type: "audio/x-mpegurl" }), `${safeName(name)}.m3u8`);
}

/** rekordbox 互換 XML */
export function exportRekordboxXML(songs: Song[], name: string) {
  const tracks = songs
    .map(
      (s, i) =>
        `    <TRACK TrackID="${i + 1}" Name="${xmlEscape(s.title)}" Artist="${xmlEscape(s.producer ?? "")}" Composer="${xmlEscape(s.vocal ?? "")}" AverageBpm="${s.bpm ?? 0}" Tonality="${xmlEscape(s.key ?? "")}" Location="${xmlEscape(s.url ?? s.links.youtube)}"/>`,
    )
    .join("\n");
  const keys = songs.map((_, i) => `        <TRACK Key="${i + 1}"/>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="music-extractor" Version="2.0" Company=""/>
  <COLLECTION Entries="${songs.length}">
${tracks}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="${xmlEscape(name)}" Type="1" KeyType="0" Entries="${songs.length}">
${keys}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`;
  download(new Blob([xml], { type: "application/xml" }), `${safeName(name)}.xml`);
}

export function youtubePlaylistUrls(songs: Song[]): string[] {
  const ids = songs.map((s) => (s.url ? parseYouTube(s.url).videoId : undefined)).filter((x): x is string => !!x);
  return buildYouTubePlaylistUrls([...new Set(ids)]);
}

/**
 * 画像書き出し。html2canvas は Tailwind v4 の oklch() 色に非対応で失敗するため、
 * Canvas に直接描画する方式に変更。
 */
export function exportPNG(songs: Song[], name: string, dark: boolean) {
  const cols: { label: string; w: number; get: (s: Song, i: number) => string }[] = [
    { label: "#", w: 50, get: (_s: Song, i: number) => String(i + 1) },
    { label: "曲名", w: 420, get: (s: Song) => s.title },
    { label: "ボカロP", w: 220, get: (s: Song) => s.producer ?? "-" },
    { label: "合成音声", w: 200, get: (s: Song) => s.vocal ?? "-" },
    { label: "BPM", w: 70, get: (s: Song) => (s.bpm ? String(s.bpm) : "-") },
    { label: "Key", w: 70, get: (s: Song) => s.key ?? "-" },
    { label: "再生数", w: 130, get: (s: Song) => (s.views !== undefined ? s.views.toLocaleString("ja-JP") : "-") },
  ];
  const scale = 2, rowH = 40, pad = 24, headH = 72;
  const width = cols.reduce((n, c) => n + c.w, 0) + pad * 2;
  const height = headH + rowH * (songs.length + 1) + pad;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = Math.min(height, 30000) * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas を利用できません");
  ctx.scale(scale, scale);
  const C = dark
    ? { bg: "#0f172a", head: "#1e293b", text: "#e2e8f0", sub: "#94a3b8", line: "#334155", accent: "#a5b4fc" }
    : { bg: "#ffffff", head: "#eef2ff", text: "#0f172a", sub: "#64748b", line: "#e2e8f0", accent: "#4338ca" };
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, height);
  const font = '"BIZ UDPGothic","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';
  ctx.fillStyle = C.accent;
  ctx.font = `bold 22px ${font}`;
  ctx.fillText(`${name}（${songs.length}曲）`, pad, 44);
  let y = headH;
  ctx.fillStyle = C.head;
  ctx.fillRect(pad, y, width - pad * 2, rowH);
  const clip = (t: string, w: number) => {
    if (ctx.measureText(t).width <= w - 12) return t;
    let s = t;
    while (s.length > 1 && ctx.measureText(s + "…").width > w - 12) s = s.slice(0, -1);
    return s + "…";
  };
  const drawRow = (vals: string[], bold: boolean, color: string) => {
    let x = pad;
    ctx.font = `${bold ? "bold " : ""}15px ${font}`;
    ctx.fillStyle = color;
    vals.forEach((v, i) => {
      ctx.fillText(clip(v, cols[i].w), x + 8, y + 26);
      x += cols[i].w;
    });
    y += rowH;
    ctx.strokeStyle = C.line;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  };
  drawRow(cols.map((c) => c.label), true, C.sub);
  songs.forEach((s, i) => drawRow(cols.map((c) => c.get(s, i)), false, C.text));
  canvas.toBlob((b) => b && download(b, `${safeName(name)}.png`), "image/png");
}

/** JSON バックアップ */
export function exportJSON(data: unknown, filename: string) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

/* ---------- セトリ ---------- */

export async function exportSetlistXLSX(sl: Setlist) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet<string | number>([[...SETLIST_COLUMNS], ...setlistRows(sl)]);
  ws["!cols"] = [{ wch: 5 }, { wch: 10 }, { wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "セトリ");
  XLSX.writeFile(wb, `${safeName(sl.name)}.xlsx`);
}

export function exportSetlistsJSON(list: Setlist[], name: string) {
  download(new Blob([setlistsToJSON(list)], { type: "application/json" }), `${safeName(name)}.json`);
}
