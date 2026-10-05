"use client";

import { useState } from "react";
import type { Setlist } from "@/lib/setlist";
import { formatDuration, computeTimeline } from "@/lib/setlist";
import type { Song } from "@/lib/types";
import { Modal, cx, inputCls } from "./ui";

export type SetlistTarget = { id: string } | { newName: string };

/** 抽出結果の曲をどのセトリに入れるか選ぶ */
export function SetlistAddModal({ open, onClose, songs, label, setlists, onAdd }: { open: boolean; onClose: () => void; songs: Song[]; label: string; setlists: Setlist[]; onAdd: (t: SetlistTarget) => void }) {
  const [choice, setChoice] = useState<string>(""); // "" = 先頭、"new" = 新規
  const [name, setName] = useState("");
  const value = choice || (setlists[0]?.id ?? "new");
  const submit = () => onAdd(value === "new" ? { newName: name.trim() || "新しいセトリ" } : { id: value });
  return (
    <Modal open={open} onClose={onClose} title="セトリに追加">
      <p className="text-sm text-slate-600 dark:text-slate-300">{label}（{songs.length}曲）を追加します。テンプレートの空き曲枠があれば先に埋め、足りない分は曲の後ろに追加します。</p>
      <div className="mt-3 space-y-2" role="radiogroup" aria-label="追加先のセトリ">
        {setlists.map((s) => {
          const tl = computeTimeline(s.items, s.startTime);
          const free = s.items.filter((i) => i.placeholder).length;
          return (
            <button key={s.id} type="button" role="radio" aria-checked={value === s.id} onClick={() => setChoice(s.id)}
              className={cx("w-full rounded-2xl border-2 px-4 py-3 text-left", value === s.id ? "border-indigo-600 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/15" : "border-slate-200 dark:border-slate-800")}>
              <span className="block truncate text-sm font-bold">{s.name}</span>
              <span className="block text-xs text-slate-500">曲{tl.songCount}・{formatDuration(tl.total)}{free ? `・空き曲枠${free}` : ""}</span>
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={value === "new"} onClick={() => setChoice("new")}
          className={cx("w-full rounded-2xl border-2 border-dashed px-4 py-3 text-left text-sm font-bold", value === "new" ? "border-indigo-600 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/15" : "border-slate-300 dark:border-slate-700")}>
          ＋ 新しいセトリを作って追加
        </button>
      </div>
      {value === "new" && <input aria-label="新しいセトリの公演名" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="公演名（任意）" className={cx(inputCls, "mt-3")} />}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button onClick={onClose} className="rounded-xl bg-slate-100 py-3 font-bold hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">キャンセル</button>
        <button onClick={submit} disabled={!songs.length} className="rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-40">追加する</button>
      </div>
    </Modal>
  );
}
