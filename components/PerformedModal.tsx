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
      <p className="text-sm text-slate-600 dark:text-slate-300">過去の公演で演奏した曲を貼り付けてください（1行に1曲、「曲名 / P名」でも曲名だけでも可）。抽出結果に「演奏済み」バッジが付き、セトリでは重複の警告が出ます。曲名のみで照合します。</p>
      <label htmlFor="performed-text" className="sr-only">演奏済みリスト</label>
      <textarea id="performed-text" value={text} maxLength={MAX_PERFORMED_TEXT} onChange={(e) => setText(e.target.value)} rows={10} placeholder={"ロキ / みきとP\n千本桜 / 黒うさP\nメルト"} className={cx(inputCls, "mt-3 font-mono")} />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>認識した曲: <b className="text-slate-700 dark:text-slate-200">{entries.length}曲</b>（重複は1曲として数えます）</span>
        <span className="ml-auto flex gap-2">
          <button onClick={() => setText(entries.map((e) => (e.producer ? `${e.title} / ${e.producer}` : e.title)).join("\n") + (entries.length ? "\n" : ""))} disabled={!entries.length} className="rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200">重複を除いて整える</button>
          {armed ? (
            <>
              <button onClick={() => { setText(""); setArmed(false); }} className="rounded-lg bg-rose-600 px-3 py-2 font-bold text-white hover:bg-rose-700">本当に消す</button>
              <button onClick={() => setArmed(false)} className="rounded-lg px-3 py-2 font-bold">やめる</button>
            </>
          ) : (
            <button onClick={() => setArmed(true)} disabled={!text} className="rounded-lg px-3 py-2 font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-500/10">すべて消す</button>
          )}
        </span>
      </div>
      <button onClick={() => { setArmed(false); onClose(); }} className="mt-4 w-full rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700">閉じる（自動保存済み）</button>
    </Modal>
  );
}
