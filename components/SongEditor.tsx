"use client";

import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { applySongEdit, type SongEditDraft } from "@/lib/song-edit";
import type { Song } from "@/lib/types";
import { Field, Modal, inputCls } from "./ui";

export function SongEditor({ song, onSave, onClose }: { song: Song; onSave: (song: Song) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<SongEditDraft>(() => ({
    title: song.title,
    producer: song.producer ?? "",
    vocal: song.vocal ?? "",
    bpm: song.bpm === undefined ? "" : String(song.bpm),
    key: song.key ?? "",
    mmd: song.mmd ?? "",
    url: song.url ?? "",
  }));
  const [error, setError] = useState("");
  const update = (field: keyof SongEditDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = applySongEdit(song, draft);
    if (!result.ok) { setError(result.error); return; }
    setError("");
    onSave(result.song);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="楽曲情報を編集" size="lg">
      <form onSubmit={save} noValidate onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.requestSubmit();
        }
      }}>
        <div className="space-y-4">
          <Field label="曲名（必須）">
            {(id) => <input id={id} className={inputCls} value={draft.title} onChange={(event) => update("title", event.target.value)} required />}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="ボカロP・作曲者">
              {(id) => <input id={id} className={inputCls} value={draft.producer} onChange={(event) => update("producer", event.target.value)} placeholder="例: DECO*27" />}
            </Field>
            <Field label="合成音声・歌唱者">
              {(id) => <input id={id} className={inputCls} value={draft.vocal} onChange={(event) => update("vocal", event.target.value)} placeholder="例: 初音ミク" />}
            </Field>
            <Field label="BPM">
              {(id) => <input id={id} type="text" inputMode="decimal" className={inputCls} value={draft.bpm} onChange={(event) => update("bpm", event.target.value)} placeholder="例: 175.5" />}
            </Field>
            <Field label="Key">
              {(id) => <input id={id} className={inputCls} value={draft.key} onChange={(event) => update("key", event.target.value)} placeholder="例: Am / 8A" />}
            </Field>
            <Field label="MMD">
              {(id) => <select id={id} className={inputCls} value={draft.mmd} onChange={(event) => update("mmd", event.target.value)}>
                <option value="">未設定</option>
                <option value="あり">あり</option>
                <option value="なし">なし</option>
                <option value="不明">不明</option>
              </select>}
            </Field>
          </div>
          <Field label="楽曲・動画URL">
            {(id) => <input id={id} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" className={inputCls} value={draft.url} onChange={(event) => update("url", event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />}
          </Field>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 dark:bg-rose-500/10 dark:text-rose-100">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-slate-100 py-3 font-bold hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">キャンセル</button>
          <button type="submit" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700"><Save className="h-4 w-4" />保存</button>
        </div>
      </form>
    </Modal>
  );
}
