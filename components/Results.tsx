"use client";

import { AlertTriangle, ArrowDown, ArrowUp, CalendarPlus, Check, Copy, ExternalLink, FileImage, FileSpreadsheet, FileText, History, ListMusic, Music2, Pencil, Play, Printer, Search, SearchX, Shuffle, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { exportCSV, exportM3U8, exportPNG, exportRekordboxXML, exportXLSX, toTSV, youtubePlaylistUrls } from "@/lib/exporters";
import { parseYouTube, songKey } from "@/lib/parse";
import type { Setlist } from "@/lib/setlist";
import { pickRandom } from "@/lib/stats";
import type { ExtractResponse, Song } from "@/lib/types";
import { CheckBox, Card, StateView, btn, cx, inputCls, useToast } from "./ui";
import { ResultsStats } from "./ResultsStats";
import { SetlistAddModal, type SetlistTarget } from "./SetlistAddModal";
import { SongEditor } from "./SongEditor";

type SortKey = "index" | "title" | "producer" | "vocal" | "bpm" | "views" | "comments";

const PERFORMED_BADGE = "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100";
const CHIP = "rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "index", label: "抽出順" }, { key: "title", label: "曲名" }, { key: "producer", label: "ボカロP" }, { key: "vocal", label: "合成音声" },
  { key: "bpm", label: "BPM" }, { key: "views", label: "再生数" }, { key: "comments", label: "コメント数" },
];
const EMPTY_KEYS: Set<string> = new Set();

type ResultsProps = {
  songs: Song[];
  setSongs: (s: Song[]) => void;
  name: string;
  meta?: ExtractResponse["meta"];
  warnings: string[];
  dark: boolean;
  /** 演奏済みリストの曲名キー（songKey） */
  performedKeys?: Set<string>;
  onOpenPerformed?: () => void;
  setlists?: Setlist[];
  onAddToSetlist?: (songs: Song[], target: SetlistTarget) => void;
};

export function Results({ songs, setSongs, name, meta, warnings, dark, performedKeys = EMPTY_KEYS, onOpenPerformed, setlists = [], onAddToSetlist }: ResultsProps) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "index", desc: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Song | null>(null);
  const [hidePerformed, setHidePerformed] = useState(false);
  const [randomN, setRandomN] = useState("5");
  const [addOpen, setAddOpen] = useState(false);

  // 元の並び順（行番号用）。行ごとに indexOf すると曲数の2乗の計算になるので先に作る
  const order = useMemo(() => new Map(songs.map((s, i) => [s.id, i + 1])), [songs]);
  const performedIds = useMemo(() => new Set(performedKeys.size ? songs.filter((s) => performedKeys.has(songKey(s.title))).map((s) => s.id) : []), [songs, performedKeys]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = songs.map((s, i) => ({ s, i })).filter(({ s }) => !(hidePerformed && performedIds.has(s.id))).filter(({ s }) => !needle || `${s.title} ${s.producer ?? ""} ${s.vocal ?? ""} ${s.key ?? ""}`.toLowerCase().includes(needle));
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
  }, [songs, q, sort, hidePerformed, performedIds]);

  const target = selected.size ? songs.filter((s) => selected.has(s.id)) : view;
  const targetLabel = selected.size ? `選択中の${selected.size}曲` : q || hidePerformed ? `表示中の${view.length}曲` : `全${songs.length}曲`;

  const setSortKey = (key: SortKey) => setSort({ key, desc: key === "views" || key === "comments" });
  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = view.length > 0 && view.every((s) => selected.has(s.id));
  const toggleVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    for (const song of view) {
      if (allSelected) next.delete(song.id);
      else next.add(song.id);
    }
    return next;
  });
  const saveSong = (song: Song) => {
    setSongs(songs.map((current) => current.id === song.id ? song : current));
    setEditing(null);
    toast("曲情報を保存しました");
  };

  const run = async (fn: () => void | Promise<void>, ok: string) => {
    try { await fn(); toast(ok); } catch { toast("書き出しに失敗しました", "err"); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(toTSV(target)); toast("コピーしました"); } catch { toast("コピーできませんでした", "err"); }
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
    const before = songs;
    const count = selected.size;
    setSongs(songs.filter((s) => !selected.has(s.id)));
    setSelected(new Set());
    toast(`${count}曲を削除しました`, "info", { label: "元に戻す", onClick: () => setSongs(before) });
  };
  const pickN = () => {
    const n = Math.floor(Number(randomN));
    if (!view.length) { toast("対象の曲がありません", "err"); return; }
    if (!Number.isFinite(n) || n < 1) { toast("1以上の曲数を入力してください", "err"); return; }
    const picked = pickRandom(view, n);
    setSelected(new Set(picked.map((x) => x.id)));
    toast(n > view.length ? `表示中の${view.length}曲すべてを選びました` : `ランダムに${picked.length}曲を選びました`, "info");
  };
  const addToSetlist = (t: SetlistTarget) => {
    setAddOpen(false);
    onAddToSetlist?.(target, t);
  };
  const fmt = (n?: number) => (n === undefined ? "-" : n.toLocaleString("ja-JP"));

  const exportBtns = [
    { label: "Excel", icon: FileSpreadsheet, on: () => run(() => exportXLSX(target, name), "Excelを書き出しました") },
    { label: "CSV", icon: FileText, on: () => run(() => exportCSV(target, name), "CSVを書き出しました") },
    { label: "コピー", icon: Copy, on: copy },
    { label: "画像", icon: FileImage, on: () => run(() => exportPNG(target, name, dark), "画像を書き出しました") },
    { label: "PDF/印刷", icon: Printer, on: () => window.print() },
    { label: "M3U8", icon: ListMusic, on: () => run(() => exportM3U8(target, name), "M3U8を書き出しました") },
    { label: "rekordbox", icon: ListMusic, on: () => run(() => exportRekordboxXML(target, name), "XMLを書き出しました") },
  ];

  if (songs.length === 0) {
    return (
      <Card className="print-area">
        <StateView icon={<SearchX className="h-10 w-10" />} title="曲が見つかりませんでした">
          {warnings.length > 0 && <ul className="space-y-1 text-sm">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </StateView>
      </Card>
    );
  }

  return (
    <Card className="print-area">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">抽出結果 <span className="text-indigo-700 dark:text-indigo-300">{songs.length}曲</span></h2>
          {meta && (
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 print:hidden">
              {meta.mode === "fast" ? "高速" : meta.mode === "ai" ? "AI抽出" : "統計"}
              {meta.provider ? `・${meta.provider === "gemini" ? "Gemini" : "ChatGPT"}` : ""}・候補{meta.candidates}曲・{(meta.elapsedMs / 1000).toFixed(1)}秒
            </p>
          )}
        </div>
        <button onClick={openPlaylist} className={cx(btn.base, btn.tonal, "print:hidden")}>
          <Play className="h-4 w-4 fill-current" aria-hidden />YouTubeで連続再生
        </button>
      </div>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100 print:hidden">
          {warnings.map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{w}</li>)}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-3 print:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-400" aria-hidden />
          <input type="search" aria-label="結果を検索" value={q} onChange={(e) => setQ(e.target.value)} placeholder="曲名・P名・ボカロで検索" className={cx(inputCls, "pl-10")} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onAddToSetlist && (
            <button onClick={() => setAddOpen(true)} disabled={!target.length} className={cx(btn.base, btn.filled)}>
              <CalendarPlus className="h-4 w-4" aria-hidden />セトリに追加<span className="font-normal opacity-90">（{targetLabel}）</span>
            </button>
          )}
          <div className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 pl-3 pr-1 dark:border-slate-600">
            <Shuffle className="h-4 w-4 text-slate-600 dark:text-slate-400" aria-hidden />
            <label htmlFor="random-n" className="text-sm font-bold">ランダムに</label>
            <input id="random-n" type="number" inputMode="numeric" min={1} max={999} value={randomN} onChange={(e) => setRandomN(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pickN()} className="h-9 w-16 rounded-lg border pointer-coarse:h-11 border-slate-400 bg-white px-2 text-base tabular-nums dark:border-slate-600 dark:bg-slate-950 sm:text-sm" />
            <span className="text-sm font-bold">曲</span>
            <button onClick={pickN} disabled={!view.length} className={cx(btn.base, btn.tonal, "min-h-9 rounded-lg px-3")}>選ぶ</button>
          </div>
        </div>

        {(performedKeys.size > 0 || onOpenPerformed) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {performedKeys.size > 0 && (
              <CheckBox checked={hidePerformed} onChange={setHidePerformed} label="演奏済みの曲を隠す" text={<>演奏済みを隠す<span className="ml-1 font-normal text-slate-600 dark:text-slate-400">（{performedIds.size}曲）</span></>} />
            )}
            {onOpenPerformed && <button onClick={onOpenPerformed} className={cx(btn.base, btn.text, "px-3 text-indigo-700 dark:text-indigo-300")}><History className="h-4 w-4" aria-hidden />{performedKeys.size ? "演奏済みリストを編集" : "演奏済みリストを登録"}</button>}
          </div>
        )}

        <ResultsStats songs={view} label={`表示中の${view.length}曲`} />

        <div>
          <p className="mb-2 text-sm font-bold">書き出し<span className="ml-2 font-normal text-slate-600 dark:text-slate-400">{targetLabel}</span></p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {exportBtns.map((b) => (
              <button key={b.label} onClick={b.on} className={cx(btn.base, btn.soft, "px-3")}>
                <b.icon className="h-4 w-4 shrink-0" aria-hidden />{b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 一覧の見出し行。スクロールしてもヘッダーの下に残り、選択中は一括操作に切り替わる（高さは一定なので一覧がずれない） */}
      <div className={cx(
        "sticky top-[calc(max(0.625rem,env(safe-area-inset-top))_+_3.375rem_+_1px)] z-20 -mx-4 mt-4 flex min-h-14 items-center gap-1 border-y px-1 sm:-mx-6 sm:px-3 print:hidden",
        selected.size ? "border-indigo-300 bg-indigo-50 text-indigo-950 dark:border-indigo-500/50 dark:bg-indigo-950 dark:text-indigo-50" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
      )}>
        <CheckBox
          checked={allSelected}
          indeterminate={selected.size > 0 && !allSelected}
          onChange={toggleVisible}
          disabled={!view.length}
          label="表示中の曲をすべて選択"
          className="min-w-0"
          text={<span className="truncate">{selected.size ? `${selected.size}曲を選択中` : <>すべて選択<span className="ml-1 font-normal text-slate-600 dark:text-slate-400">（{view.length}曲）</span></>}</span>}
        />
        <span className="sr-only" aria-live="polite">{selected.size ? `${selected.size}曲を選択中` : ""}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {selected.size ? (
            <>
              <button onClick={removeSelected} className={cx(btn.base, btn.dangerText, "px-3")}><Trash2 className="h-4 w-4" aria-hidden />削除</button>
              <button onClick={() => setSelected(new Set())} aria-label="選択を解除" className={btn.icon}><X className="h-5 w-5" /></button>
            </>
          ) : (
            <>
              <label htmlFor="sort-key" className="sr-only">並べ替え</label>
              <select id="sort-key" value={sort.key} onChange={(e) => setSortKey(e.target.value as SortKey)} className={cx(inputCls, "!w-auto py-1.5")}>
                {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <button onClick={() => setSort((x) => ({ ...x, desc: !x.desc }))} aria-label={sort.desc ? "降順（押すと昇順）" : "昇順（押すと降順）"} className={btn.icon}>
                {sort.desc ? <ArrowDown className="h-5 w-5" /> : <ArrowUp className="h-5 w-5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 一覧（画面表示。PC もスマホも同じ並び。横スクロールなし） */}
      <ul className="mt-3 space-y-2 print:hidden" aria-label="抽出された曲">
        {view.map((s) => (
          <li key={s.id} className={cx("flex items-start gap-1 rounded-2xl border py-1 pl-1 pr-2", selected.has(s.id) ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10" : "border-slate-200 dark:border-slate-700")}>
            <CheckBox checked={selected.has(s.id)} onChange={() => toggleSel(s.id)} label={`${s.title}を選択`} />
            <div className="min-w-0 flex-1 py-2">
              <p className="break-words font-bold leading-snug">
                <span className="mr-2 text-sm font-normal tabular-nums text-slate-600 dark:text-slate-400">{order.get(s.id)}</span>
                {s.title}
                {performedIds.has(s.id) && <span className={cx(PERFORMED_BADGE, "ml-2 align-middle")}><Check className="h-3 w-3" aria-hidden />演奏済み</span>}
              </p>
              {(s.producer || s.vocal) && <p className="mt-0.5 break-words text-sm text-slate-700 dark:text-slate-300">{[s.producer, s.vocal].filter(Boolean).join(" ・ ")}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {s.bpm !== undefined && <span className={CHIP}>BPM {s.bpm}</span>}
                {s.key && <span className={CHIP}>Key {s.key}</span>}
                {s.mmd === "あり" && <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-xs font-bold text-purple-900 dark:bg-purple-500/20 dark:text-purple-100">MMD</span>}
                {s.views !== undefined && <span className={CHIP}>再生 {fmt(s.views)}</span>}
                {s.comments !== undefined && <span className={CHIP}>コメント {fmt(s.comments)}</span>}
              </div>
              <LinkChips s={s} />
            </div>
            <button onClick={() => setEditing(s)} aria-label={`${s.title}の曲情報を編集`} className={cx(btn.base, btn.soft, "mt-1 shrink-0 px-3")}><Pencil className="h-4 w-4" aria-hidden />編集</button>
          </li>
        ))}
      </ul>
      {view.length === 0 && <StateView className="mt-4 print:hidden" icon={<Music2 className="h-9 w-9" />} title="条件に合う曲がありません">
        <button onClick={() => { setQ(""); setHidePerformed(false); }} className={cx(btn.base, btn.outlined)}>絞り込みを解除</button>
      </StateView>}

      {/* 印刷・PDF 用の表（画面には出さない） */}
      <table className="mt-4 hidden w-full text-left text-sm print:table">
        <thead className="border-b-2 border-slate-400">
          <tr>{["#", "曲名", "ボカロP", "合成音声", "BPM", "Key", "MMD", "再生数"].map((h) => <th key={h} className={cx("px-2 py-2 font-bold", h === "再生数" && "text-right")}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {view.map((s) => (
            <tr key={s.id} className="border-b border-slate-300">
              <td className="px-2 py-1.5 tabular-nums">{order.get(s.id)}</td>
              <td className="px-2 py-1.5 font-bold">{s.title}</td>
              <td className="px-2 py-1.5">{s.producer ?? "-"}</td>
              <td className="px-2 py-1.5">{s.vocal ?? "-"}</td>
              <td className="px-2 py-1.5 tabular-nums">{s.bpm ?? "-"}</td>
              <td className="px-2 py-1.5">{s.key ?? "-"}</td>
              <td className="px-2 py-1.5">{s.mmd ?? "-"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.views)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {onAddToSetlist && <SetlistAddModal open={addOpen} onClose={() => setAddOpen(false)} songs={target} label={targetLabel} setlists={setlists} onAdd={addToSetlist} />}
      {editing && <SongEditor key={editing.id} song={editing} onSave={saveSong} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function LinkChips({ s }: { s: Song }) {
  const items = [
    { href: s.links.youtube, label: s.url ? (parseYouTube(s.url).videoId ? "YouTube" : "楽曲リンク") : "YouTube検索" },
    s.links.lyrics && { href: s.links.lyrics, label: "歌詞" },
    s.links.analysis && { href: s.links.analysis, label: "考察" },
    s.links.tunebat && { href: s.links.tunebat, label: "Tunebat" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <div className="-ml-2 mt-1 flex flex-wrap gap-x-1 gap-y-0.5">
      {items.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-bold text-indigo-800 hover:bg-indigo-50 pointer-coarse:min-h-11 dark:text-indigo-200 dark:hover:bg-indigo-500/15">
          {l.label}<ExternalLink className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">（新しいタブで開く）</span>
        </a>
      ))}
    </div>
  );
}
