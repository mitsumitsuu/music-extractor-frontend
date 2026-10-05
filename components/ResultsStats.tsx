"use client";

import { BarChart3, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { PRODUCER_SPLIT, VOCAL_SPLIT, bpmHistogram, countBy, mmdRatio, type CountRow } from "@/lib/stats";
import type { Song } from "@/lib/types";
import { cx } from "./ui";

function Bars({ title, rows, unknown, distinct, tone }: { title: string; rows: CountRow[]; unknown: number; distinct: number; tone: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">{title}<span className="ml-1 font-normal">（{distinct}種類{unknown ? `・未設定${unknown}曲` : ""}）</span></h4>
      {rows.length === 0 ? <p className="text-xs text-slate-500">データがありません</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate font-bold sm:w-28" title={r.label}>{r.label}</span>
              <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><span className={cx("block h-full rounded-full", tone)} style={{ width: `${(r.count / max) * 100}%` }} /></span>
              <span className="w-7 shrink-0 text-right tabular-nums text-slate-600 dark:text-slate-300">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 表示中の曲の統計（合成音声・ボカロP の上位、BPM 分布、MMD 比率）。折りたたみ式 */
export function ResultsStats({ songs, label }: { songs: Song[]; label: string }) {
  const [open, setOpen] = useState(false);
  const stats = useMemo(() => {
    if (!open) return null;
    return {
      vocal: countBy(songs, (s) => s.vocal, VOCAL_SPLIT, 8),
      producer: countBy(songs, (s) => s.producer, PRODUCER_SPLIT, 8),
      bpm: bpmHistogram(songs, 10),
      mmd: mmdRatio(songs),
    };
  }, [open, songs]);
  const maxBin = stats ? Math.max(1, ...stats.bpm.bins.map((b) => b.count)) : 1;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 print:hidden">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-slate-600 dark:text-slate-300">
        <BarChart3 className="h-4 w-4 text-indigo-500" />統計<span className="text-xs font-normal text-slate-500">（{label}）</span>
        <ChevronDown className={cx("ml-auto h-4 w-4 transition", open && "rotate-180")} />
      </button>
      {stats && (
        <div className="grid gap-5 border-t border-slate-100 p-3 dark:border-slate-800 md:grid-cols-2">
          {songs.length === 0 ? <p className="text-sm text-slate-500 md:col-span-2">対象の曲がありません</p> : (
            <>
              <Bars title="合成音声 上位8" rows={stats.vocal.rows} unknown={stats.vocal.unknown} distinct={stats.vocal.distinct} tone="bg-sky-500" />
              <Bars title="ボカロP 上位8" rows={stats.producer.rows} unknown={stats.producer.unknown} distinct={stats.producer.distinct} tone="bg-indigo-500" />
              <div className="min-w-0">
                <h4 className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  BPM 分布（10 BPM ごと）<span className="ml-1 font-normal">{stats.bpm.known ? `平均 ${stats.bpm.avg}・${stats.bpm.min}〜${stats.bpm.max}` : ""}{stats.bpm.unknown ? `・不明${stats.bpm.unknown}曲` : ""}</span>
                </h4>
                {stats.bpm.bins.length === 0 ? <p className="text-xs text-slate-500">BPM のある曲がありません</p> : (
                  <div className="flex items-end gap-0.5 overflow-x-auto pb-1" role="img" aria-label="BPM 分布のヒストグラム">
                    {stats.bpm.bins.map((b) => (
                      <div key={b.from} className="flex min-w-[1.5rem] flex-1 flex-col items-center gap-0.5" title={`${b.from}〜${b.to}: ${b.count}曲`}>
                        <span className="text-[10px] tabular-nums text-slate-500">{b.count || ""}</span>
                        <span className={cx("w-full rounded-t", b.count ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800")} style={{ height: `${Math.max(2, (b.count / maxBin) * 72)}px` }} />
                        <span className="text-[10px] tabular-nums text-slate-500">{b.from}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h4 className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">MMD あり の割合<span className="ml-1 font-normal">{Math.round(stats.mmd.ratio * 100)}%（{stats.mmd.yes}/{stats.mmd.total}曲）</span></h4>
                <div className="flex h-4 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`MMDあり ${stats.mmd.yes}曲、なし ${stats.mmd.no}曲、不明 ${stats.mmd.unknown}曲`}>
                  <span className="bg-purple-500" style={{ width: `${(stats.mmd.yes / stats.mmd.total) * 100}%` }} />
                  <span className="bg-slate-400 dark:bg-slate-600" style={{ width: `${(stats.mmd.no / stats.mmd.total) * 100}%` }} />
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-500" />あり {stats.mmd.yes}</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-600" />なし {stats.mmd.no}</span>
                  <span>不明 {stats.mmd.unknown}</span>
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
