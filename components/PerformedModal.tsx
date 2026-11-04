"use client";

import { useMemo, useState } from "react";
import { MAX_PERFORMED_TEXT, parsePerformed } from "@/lib/performed";
import { Modal, cx, inputCls } from "./ui";

/** 演奏済みリスト（過去に演奏した曲）の編集。入力はそのままこの端末に保存される */
export function PerformedModal({ open, onClose, text, setText }: { open: boolean; onClose: () => void; text: string; setText: (t: string) => void }) {
  const entries = useMemo(() => parsePerformed(text), [text]);
  const [armed, setArmed] = useState(false);
  return (
    <Modal open={open} onClose={() => { setArmed(false); onClose(); }} title="演奏済みリスト" size="lg">
      <label htmlFor="performed-text" className="mb-1.5 block text-sm font-bold">1行に1曲（曲名 / P名）</label>
      <textarea id="performed-text" value={text} maxLength={MAX_PERFORMED_TEXT} onChange={(e) => setText(e.target.value)} rows={10} placeholder={"ロキ / みきとP\n千本桜 / 黒うさP\nメルト"} className={cx(inputCls, "font-mono")} />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span className="text-sm">認識した曲 <b className="text-slate-900 dark:text-slate-100">{entries.length}曲</b></span>
        <span className="ml-auto flex gap-2">
          <button onClick={() => setText(entries.map((e) => (e.producer ? `${e.title} / ${e.producer}` : e.title)).join("\n") + (entries.length ? "\n" : ""))} disabled={!entries.length} className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-800 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-100">重複を除く</button>
          {armed ? (
            <>
              <button onClick={() => { setText(""); setArmed(false); }} className="min-h-11 rounded-lg bg-rose-700 px-3 py-2 font-bold text-white hover:bg-rose-800">本当に消す</button>
              <button onClick={() => setArmed(false)} className="min-h-11 rounded-lg px-3 py-2 font-bold">やめる</button>
            </>
          ) : (
            <button onClick={() => setArmed(true)} disabled={!text} className="min-h-11 rounded-lg px-3 py-2 font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:text-rose-300 dark:hover:bg-rose-500/10">すべて消す</button>
          )}
        </span>
      </div>
      <button onClick={() => { setArmed(false); onClose(); }} className="mt-4 min-h-12 w-full rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700">閉じる</button>
    </Modal>
  );
}
