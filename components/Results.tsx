"use client";

import { ArrowUpDown, Copy, ExternalLink, FileImage, FileSpreadsheet, FileText, ListMusic, Play, Printer, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { exportCSV, exportM3U8, exportPNG, exportRekordboxXML, exportXLSX, toTSV, youtubePlaylistUrls } from "@/lib/exporters";
import type { ExtractResponse, Song } from "@/lib/types";
import { Card, cx, useToast } from "./ui";

type SortKey = "index" | "title" | "producer" | "vocal" | "bpm" | "views" | "comments";

export function Results({ songs, setSongs, name, meta, warnings, dark }: { songs: Song[]; setSongs: (s: Song[]) => void; name: string; meta?: ExtractResponse["meta"]; warnings: string[]; dark: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "index", desc: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = songs.map((s, i) => ({ s, i })).filter(({ s }) => !needle || `${s.title} ${s.producer ?? ""} ${s.vocal ?? ""} ${s.key ?? ""}`.toLowerCase().includes(needle));
    if (sort.key !== "index") {
      const k = sort.key;
      list.sort((a, b) => {
        const av = a.s[k], bv = b.s[k];
        if (av === undefined && bv === undefined) return 0;
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        const r = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "ja");
        return sort.desc ? -r : r;
      });
    } else if (sort.desc) list.reverse();
    return list.map((x) => x.s);
  }, [songs, q, sort]);

  const target = selected.size ? songs.filter((s) => selected.has(s.id)) : view;
  const targetLabel = selected.size ? `選択中の${selected.size}曲` : q ? `表示中の${view.length}曲` : `全${songs.length}曲`;

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "views" || key === "comments" }));
  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = view.length > 0 && view.every((s) => selected.has(s.id));

  const run = async (fn: () => void | Promise<void>, ok: string) => {
    try { await fn(); toast(ok); } catch { toast("書き出しに失敗しました", "err"); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(toTSV(target)); toast("コピーしました（Excel・スプレッドシートにそのまま貼れます）"); } catch { toast("コピーできませんでした", "err"); }
  };
  const openPlaylist = () => {
    const urls = youtubePlaylistUrls(target);
    if (!urls.length) { toast("YouTubeのURLがある曲がありません", "err"); return; }
    window.open(urls[0], "_blank", "noopener");
    if (urls.length > 1) {
      void navigator.clipboard.writeText(urls.join("\n")).catch(() => {});
      toast(`50曲ごとに${urls.length}個のプレイリストに分割しました（全URLをコピー済み）`, "info");
    }
  };
  const removeSelected = () => {
    setSongs(songs.filter((s) => !selected.has(s.id)));
    setSelected(new Set());
  };
  const fmt = (n?: number) => (n === undefined ? "-" : n.toLocaleString("ja-JP"));

  const exportBtns = [
    { label: "Excel", icon: FileSpreadsheet, cls: "bg-emerald-600 hover:bg-emerald-700", on: () => run(() => exportXLSX(target, name), "Excelを書き出しました") },
    { label: "CSV", icon: FileText, cls: "bg-sky-600 hover:bg-sky-700", on: () => run(() => exportCSV(target, name), "CSVを書き出しました") },
    { label: "コピー", icon: Copy, cls: "bg-slate-600 hover:bg-slate-700", on: copy },
    { label: "画像", icon: FileImage, cls: "bg-pink-600 hover:bg-pink-700", on: () => run(() => exportPNG(target, name, dark), "画像を書き出しました") },
    { label: "PDF/印刷", icon: Printer, cls: "bg-rose-600 hover:bg-rose-700", on: () => window.print() },
    { label: "M3U8", icon: ListMusic, cls: "bg-indigo-600 hover:bg-indigo-700", on: () => run(() => exportM3U8(target, name), "M3U8を書き出しました") },
    { label: "rekordbox", icon: ListMusic, cls: "bg-indigo-800 hover:bg-indigo-900", on: () => run(() => exportRekordboxXML(target, name), "XMLを書き出しました") },
  ];

  const th = (key: SortKey, label: string, cls = "") => (
    <th className={cx("whitespace-nowrap px-3 py-2.5 font-bold", cls)}>
      <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-indigo-600">
        {label}
        <ArrowUpDown className={cx("h-3.5 w-3.5", sort.key === key ? "text-indigo-600" : "opacity-40")} />
      </button>
    </th>
  );

  return (
    <Card className="print-area">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-indigo-700 dark:text-indigo-300">抽出結果 <span className="text-slate-500">{songs.length}曲</span></h2>
          {meta && (
            <p className="mt-0.5 text-xs text-slate-500 print:hidden">
              {meta.mode === "fast" ? "高速モード" : meta.mode === "ai" ? "AI抽出" : "統計モード"}
              {meta.provider ? `・${meta.provider === "gemini" ? "Gemini" : "ChatGPT"}（${meta.model}）` : ""}・候補{meta.candidates}曲・{(meta.elapsedMs / 1000).toFixed(1)}秒
            </p>
          )}
        </div>
        <button onClick={openPlaylist} className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-red-700 print:hidden">
          <Play className="h-4 w-4 fill-current" /> YouTubeで連続再生
        </button>
      </div>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 print:hidden">
          {warnings.map((w, i) => <li key={i}>・{w}</li>)}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-3 print:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="結果を検索（曲名・P名・ボカロ）" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 sm:text-sm" />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>書き出し対象: <b className="text-slate-700 dark:text-slate-200">{targetLabel}</b></span>
          {selected.size > 0 && (
            <button onClick={removeSelected} className="flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
              <Trash2 className="h-3.5 w-3.5" />選択を削除
            </button>
          )}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
          {exportBtns.map((b) => (
            <button key={b.label} onClick={b.on} className={cx("flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-sm", b.cls)}>
              <b.icon className="h-4 w-4" /> {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* PC: テーブル */}
      <div className="mt-4 hidden overflow-x-auto md:block print:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b-2 border-slate-200 text-slate-500 dark:border-slate-700">
            <tr>
              <th className="w-10 px-3 py-2.5 print:hidden"><input type="checkbox" aria-label="すべて選択" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(view.map((s) => s.id)))} className="h-4 w-4 accent-indigo-600" /></th>
              {th("index", "#", "w-12")}
              {th("title", "曲名")}
              {th("producer", "ボカロP")}
              {th("vocal", "合成音声")}
              {th("bpm", "BPM")}
              <th className="whitespace-nowrap px-3 py-2.5 font-bold">Key</th>
              <th className="whitespace-nowrap px-3 py-2.5 font-bold">MMD</th>
              {th("views", "再生数", "text-right")}
              <th className="whitespace-nowrap px-3 py-2.5 font-bold print:hidden">リンク</th>
            </tr>
          </thead>
          <tbody>
            {view.map((s) => (
              <tr key={s.id} className={cx("border-b border-slate-100 align-top hover:bg-indigo-50/60 dark:border-slate-800 dark:hover:bg-indigo-500/5", selected.has(s.id) && "bg-indigo-50 dark:bg-indigo-500/10")}>
                <td className="px-3 py-2.5 print:hidden"><input type="checkbox" aria-label={`${s.title}を選択`} checked={selected.has(s.id)} onChange={() => toggleSel(s.id)} className="h-4 w-4 accent-indigo-600" /></td>
                <td className="px-3 py-2.5 tabular-nums text-slate-400">{songs.indexOf(s) + 1}</td>
                <td className="min-w-[9rem] px-3 py-2.5 font-bold">{s.title}</td>
                <td className="min-w-[6rem] px-3 py-2.5 text-slate-600 dark:text-slate-300">{s.producer ?? "-"}</td>
                <td className="min-w-[6rem] px-3 py-2.5 text-slate-600 dark:text-slate-300">{s.vocal ?? "-"}</td>
                <td className="px-3 py-2.5 tabular-nums">{s.bpm ?? "-"}</td>
                <td className="px-3 py-2.5">{s.key ?? "-"}</td>
                <td className="px-3 py-2.5">{s.mmd ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{fmt(s.views)}</td>
                <td className="min-w-[7rem] px-3 py-2.5 print:hidden"><LinkChips s={s} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スマホ: カード */}
      <ul className="mt-4 space-y-2 md:hidden print:hidden">
        {view.map((s) => (
          <li key={s.id} className={cx("rounded-2xl border p-3", selected.has(s.id) ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10" : "border-slate-200 dark:border-slate-800")}>
            <div className="flex items-start gap-3">
              <input type="checkbox" aria-label={`${s.title}を選択`} checked={selected.has(s.id)} onChange={() => toggleSel(s.id)} className="mt-1 h-5 w-5 shrink-0 accent-indigo-600" />
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-snug">{s.title}</p>
                <p className="mt-0.5 text-sm text-slate-500">{[s.producer, s.vocal].filter(Boolean).join(" ・ ") || "-"}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                  {s.bpm && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">BPM {s.bpm}</span>}
                  {s.key && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">Key {s.key}</span>}
                  {s.mmd === "あり" && <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-purple-800 dark:bg-purple-500/20 dark:text-purple-200">MMD</span>}
                  {s.views !== undefined && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">▶ {fmt(s.views)}</span>}
                </div>
                <div className="mt-2"><LinkChips s={s} /></div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {view.length === 0 && <p className="py-8 text-center text-sm text-slate-500">該当する曲がありません</p>}
    </Card>
  );
}

function LinkChips({ s }: { s: Song }) {
  const items = [
    { href: s.links.youtube, label: s.url ? "YouTube" : "YouTube検索" },
    s.links.lyrics && { href: s.links.lyrics, label: "歌詞" },
    s.links.analysis && { href: s.links.analysis, label: "考察" },
    s.links.tunebat && { href: s.links.tunebat, label: "Tunebat" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200">
          {l.label}<ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}
