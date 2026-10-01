"use client";

import { Copy, ExternalLink, ListMusic, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { buildYouTubePlaylistUrls, extractVideoIds } from "@/lib/parse";
import type { Song } from "@/lib/types";
import { Card, inputCls, useToast } from "./ui";

export function PlaylistTool({ lastSongs }: { lastSongs: Song[] }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const ids = useMemo(() => extractVideoIds(text), [text]);
  const urls = useMemo(() => buildYouTubePlaylistUrls(ids), [ids]);

  const onFile = async (file: File) => {
    try {
      if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        setText((t) => t + "\n" + wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n"));
      } else {
        const body = await file.text();
        setText((t) => t + "\n" + body);
      }
    } catch {
      toast("ファイルを読み込めませんでした", "err");
    }
  };

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-bold"><ListMusic className="h-5 w-5 text-indigo-600" />YouTubeプレイリスト作成</h2>
      <p className="mt-1 text-sm text-slate-500">URLを含むリスト（Excel/CSV/テキスト）から、ログイン不要で再生できるYouTubeプレイリストを作ります（50曲ごとに分割）。</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
          <Upload className="h-4 w-4" />Excel / CSV を読み込む
          <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
        </label>
        {lastSongs.some((s) => s.url) && (
          <button onClick={() => setText(lastSongs.map((s) => s.url).filter(Boolean).join("\n"))} className="rounded-xl border border-indigo-300 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-200 dark:hover:bg-indigo-500/10">
            直前の抽出結果を使う
          </button>
        )}
      </div>

      <textarea rows={8} className={`${inputCls} mt-3 font-mono text-sm`} placeholder="https://www.youtube.com/watch?v=..." value={text} onChange={(e) => setText(e.target.value)} />
      <p className="mt-2 text-sm">検出した動画: <b>{ids.length}</b> 件</p>

      {urls.length > 0 && (
        <ul className="mt-3 space-y-2">
          {urls.map((u, i) => (
            <li key={u} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <span className="text-sm font-bold">プレイリスト {i + 1}（{Math.min(50, ids.length - i * 50)}曲）</span>
              <span className="ml-auto flex gap-2">
                <a href={u} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">開く<ExternalLink className="h-3 w-3" /></a>
                <button onClick={() => navigator.clipboard.writeText(u).then(() => toast("URLをコピーしました"), () => toast("コピーできませんでした", "err"))} className="flex items-center gap-1 rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"><Copy className="h-3 w-3" />コピー</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
