"use client";

import { ArrowDown, ArrowUp, CalendarPlus, ChevronDown, ClipboardList, Copy, Download, FileSpreadsheet, History, Plus, Trash2, Undo2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { exportSetlistXLSX, exportSetlistsJSON } from "@/lib/exporters";
import { appendPerformed, parsePerformedLine } from "@/lib/performed";
import { camelotOf } from "@/lib/parse";
import {
  ITEM_TYPES, TEMPLATES, THEME_SUGGESTIONS, cloneItem, cloneSetlist, computeTimeline, createBlock, createSetlist, createSongItem, findDuplicates, findPerformed, formatDuration, insertSongItems,
  keyFlow, mergeSetlists, moveItem, parseClock, parseDuration, parseSetlistBackup, setlistSummary, setlistToText, setlistToTSV, typeLabel,
  type Setlist, type SetlistItem, type SetlistItemType,
} from "@/lib/setlist";
import { BpmLine } from "./BpmLine";
import { Card, Field, Modal, cx, inputCls, useToast } from "./ui";

type Undo = { id: number; label: string; restore: () => void };
const smallBtn = "inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800";

type Props = {
  setlists: Setlist[];
  setSetlists: (u: (prev: Setlist[]) => Setlist[]) => void;
  activeId: string;
  setActiveId: (id: string) => void;
  performedKeys: Set<string>;
  performedText: string;
  setPerformedText: (t: string) => void;
  onOpenPerformed: () => void;
};

export function SetlistView({ setlists, setSetlists, activeId, setActiveId, performedKeys, performedText, setPerformedText, onOpenPerformed }: Props) {
  const toast = useToast();
  const active = setlists.find((s) => s.id === activeId) ?? setlists[0];
  const [createOpen, setCreateOpen] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoSeq = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState("");
  const [armedId, setArmedId] = useState<string | null>(null);
  const armedDelete = !!active && armedId === active.id;
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const offerUndo = (label: string, restore: () => void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const id = ++undoSeq.current;
    setUndo({ id, label, restore });
    undoTimer.current = setTimeout(() => setUndo((u) => (u?.id === id ? null : u)), 9000);
  };

  const patch = (fn: (s: Setlist) => Setlist) => {
    if (!active) return;
    const id = active.id;
    setSetlists((prev) => prev.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)));
  };
  const patchItem = (itemId: string, p: Partial<SetlistItem>) => patch((s) => ({ ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...p, ...(p.title !== undefined || p.producer !== undefined ? { placeholder: undefined } : {}) } : it)) }));

  const tl = useMemo(() => (active ? computeTimeline(active.items, active.startTime) : null), [active]);
  const dups = useMemo(() => (active ? findDuplicates(active.items) : null), [active]);
  const perf = useMemo(() => (active ? findPerformed(active.items, performedKeys) : null), [active, performedKeys]);
  const farKeys = useMemo(() => (active ? keyFlow(active.items).filter((t) => t.adjacent && t.relation === "far") : []), [active]);

  /* ---- セトリの作成・複製・削除 ---- */
  const createList = (opts: Parameters<typeof createSetlist>[0]) => {
    if (setlists.length >= 50) { toast("セトリは最大50件です", "err"); return; }
    const s = createSetlist(opts);
    setSetlists((prev) => [...prev, s]);
    setActiveId(s.id);
    setCreateOpen(false);
    toast(`「${s.name}」を作成しました`);
  };
  const duplicateList = () => {
    if (!active || setlists.length >= 50) return;
    const c = cloneSetlist(active);
    setSetlists((prev) => { const i = prev.findIndex((s) => s.id === active.id); const n = prev.slice(); n.splice(i + 1, 0, c); return n; });
    setActiveId(c.id);
    toast("セトリを複製しました");
  };
  const deleteList = () => {
    if (!active) return;
    const removed = active;
    const index = setlists.findIndex((s) => s.id === removed.id);
    const rest = setlists.filter((s) => s.id !== removed.id);
    setSetlists(() => rest);
    setActiveId(rest[Math.max(0, index - 1)]?.id ?? "");
    setArmedId(null);
    offerUndo(`セトリ「${removed.name}」を削除しました`, () => {
      setSetlists((prev) => { const n = prev.slice(); n.splice(Math.min(index, n.length), 0, removed); return n; });
      setActiveId(removed.id);
    });
  };

  /* ---- 項目の操作 ---- */
  const addBlock = (type: Exclude<SetlistItemType, "song">) => patch((s) => ({ ...s, items: [...s.items, createBlock(type, s.items)] }));
  const addManualSong = () => {
    const e = parsePerformedLine(manual);
    if (!e) { toast("「曲名 / P名」の形式で入力してください", "err"); return; }
    patch((s) => insertSongItems(s, [createSongItem(e)]).setlist);
    setManual("");
  };
  const removeItem = (it: SetlistItem, index: number) => {
    if (!active) return;
    const listId = active.id;
    patch((s) => ({ ...s, items: s.items.filter((x) => x.id !== it.id) }));
    offerUndo(`「${it.title}」を削除しました`, () => setSetlists((prev) => prev.map((s) => { if (s.id !== listId) return s; const n = s.items.slice(); n.splice(Math.min(index, n.length), 0, it); return { ...s, items: n, updatedAt: Date.now() }; })));
  };
  const dupItem = (index: number) => patch((s) => { const n = s.items.slice(); n.splice(index + 1, 0, cloneItem(s.items[index])); return { ...s, items: n }; });
  const move = (index: number, to: number) => patch((s) => ({ ...s, items: moveItem(s.items, index, to) }));

  /* ---- 書き出し ---- */
  const copyText = async (text: string, ok: string) => {
    try { await navigator.clipboard.writeText(text); toast(ok); } catch { toast("コピーできませんでした", "err"); }
  };
  const doXlsx = async () => { if (!active) return; try { await exportSetlistXLSX(active); toast("Excelを書き出しました"); } catch { toast("書き出しに失敗しました", "err"); } };
  const importFile = async (file: File) => {
    try {
      const list = parseSetlistBackup(await file.text());
      if (!list) { toast("セトリのバックアップとして読み込めませんでした", "err"); return; }
      const r = mergeSetlists(setlists, list);
      setSetlists(() => r.list.slice(0, 50));
      if (!active) setActiveId(r.list[0]?.id ?? "");
      toast(`読み込みました（追加${r.added}件・更新${r.updated}件）`);
    } catch { toast("ファイルを読み込めませんでした", "err"); }
  };
  const registerPerformed = () => {
    if (!active) return;
    const songs = active.items.filter((i) => i.type === "song" && !i.placeholder);
    const r = appendPerformed(performedText, songs);
    if (r.added) setPerformedText(r.text);
    toast(r.added ? `${r.added}曲を演奏済みリストに追加しました` : "追加できる曲がありません（登録済み・または曲がありません）", r.added ? "ok" : "info");
  };

  const hasSongs = !!active?.items.some((i) => i.type === "song" && !i.placeholder);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-lg font-bold">セトリ<span className="ml-2 text-sm font-normal text-slate-500">この端末に自動保存</span></h2>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          <button onClick={onOpenPerformed} className={cx(smallBtn, "text-slate-600 dark:text-slate-300")}><History className="h-4 w-4" />演奏済みリスト{performedKeys.size ? `（${performedKeys.size}）` : ""}</button>
          <button onClick={() => exportSetlistsJSON(setlists, "setlists-backup")} disabled={!setlists.length} className={cx(smallBtn, "text-slate-600 disabled:opacity-40 dark:text-slate-300")}><Download className="h-4 w-4" />バックアップ</button>
          <button onClick={() => fileRef.current?.click()} className={cx(smallBtn, "text-slate-600 dark:text-slate-300")}><Upload className="h-4 w-4" />復元</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" aria-label="セトリのバックアップを選択" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
        </span>
      </div>

      {undo && (
        <div role="status" className="flex items-center gap-3 rounded-2xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white dark:bg-slate-200 dark:text-slate-900">
          <span className="min-w-0 flex-1 truncate">{undo.label}</span>
          <button onClick={() => { undo.restore(); setUndo(null); }} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 hover:bg-white/25 dark:bg-slate-900/10"><Undo2 className="h-4 w-4" />元に戻す</button>
          <button onClick={() => setUndo(null)} aria-label="閉じる" className="shrink-0 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* セトリ選択 */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide">
          <div className="flex w-max gap-2 py-1" role="tablist" aria-label="セトリの切り替え">
            {setlists.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === active?.id} onClick={() => setActiveId(s.id)}
                className={cx("max-w-[12rem] shrink-0 truncate rounded-full border px-4 py-2 text-sm font-bold transition", s.id === active?.id ? "border-indigo-600 bg-indigo-600 text-white shadow" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300")}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-slate-400 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"><Plus className="h-4 w-4" />新規</button>
      </div>

      {!active || !tl || !dups || !perf ? (
        <Card>
          <div className="py-6 text-center">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-indigo-400" />
            <p className="font-bold">まだセトリがありません</p>
            <p className="mt-1 text-sm text-slate-500">テンプレートから作るか、抽出結果の「セトリに追加」から作成できます。</p>
            <button onClick={() => setCreateOpen(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />セトリを作る</button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="公演名">{(id) => <input id={id} value={active.name} maxLength={60} onChange={(e) => patch((s) => ({ ...s, name: e.target.value }))} onBlur={(e) => { if (!e.target.value.trim()) patch((s) => ({ ...s, name: "無題のセトリ" })); }} className={inputCls} />}</Field>
              <Field label="テーマ">{(id) => <input id={id} value={active.theme ?? ""} maxLength={60} list="setlist-themes" onChange={(e) => patch((s) => ({ ...s, theme: e.target.value || undefined }))} placeholder="例: 近未来" className={inputCls} />}</Field>
              <Field label="日付">{(id) => <input id={id} type="date" value={active.date ?? ""} onChange={(e) => patch((s) => ({ ...s, date: e.target.value || undefined }))} className={inputCls} />}</Field>
              <Field label="開始時刻（任意）" hint="入れると各項目の開始を時刻で表示します（空なら経過時間）">{(id) => <input id={id} type="time" value={active.startTime ?? ""} onChange={(e) => patch((s) => ({ ...s, startTime: parseClock(e.target.value) !== null ? e.target.value : undefined }))} className={inputCls} />}</Field>
            </div>
            <datalist id="setlist-themes">{THEME_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {THEME_SUGGESTIONS.map((t) => <button key={t} onClick={() => patch((s) => ({ ...s, theme: t }))} className={cx("rounded-full border px-3 py-1 text-xs font-bold", active.theme === t ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200" : "border-slate-200 text-slate-500 dark:border-slate-700")}>{t}</button>)}
            </div>
          </Card>

          <Card>
            {/* 合計 */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="セトリの合計">
              {[["合計時間", formatDuration(tl.total)], ["曲数", `${tl.songCount}曲`], ["MC", `${tl.mcCount}回`], [tl.startClock ? "終了予定" : "項目数", tl.startClock ? `${tl.endClock}` : `${active.items.length}`]].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500">{k}</p>
                  <p className="text-lg font-bold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            {(dups.titles.length > 0 || perf.titles.length > 0 || farKeys.length > 0) && (
              <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="alert">
                {dups.titles.length > 0 && <li>・曲が重複しています: {dups.titles.join("、")}</li>}
                {perf.titles.length > 0 && <li>・演奏済みの曲が含まれています: {perf.titles.join("、")}</li>}
                {farKeys.length > 0 && <li>・続けて演奏する曲で Key が離れている箇所: {farKeys.map((t) => `${t.from.songNo}→${t.to.songNo}曲目（${t.from.camelot}→${t.to.camelot}）`).join("、")}</li>}
              </ul>
            )}
            <div className="mt-4"><BpmLine items={active.items} /></div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold">進行表<span className="ml-2 text-sm font-normal text-slate-500">{setlistSummary(active)}</span></h3>
            </div>
            {active.items.length === 0 && <p className="mt-4 rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-slate-800/60">項目がありません。下のボタンから OP・MC・曲を追加してください。</p>}
            <ol className="mt-3 space-y-2">
              {active.items.map((it, i) => (
                <ItemRow key={it.id} it={it} index={i} last={i === active.items.length - 1} start={tl.byId[it.id]?.start ?? ""} songNo={tl.byId[it.id]?.songNo} clock={!!tl.startClock}
                  dup={dups.ids.has(it.id)} performed={perf.ids.has(it.id)}
                  onChange={(p) => patchItem(it.id, p)} onMove={(to) => move(i, to)} onDuplicate={() => dupItem(i)} onRemove={() => removeItem(it, i)} />
              ))}
            </ol>

            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="mb-2 text-sm font-bold text-slate-600 dark:text-slate-300">項目を追加（末尾）</p>
              <div className="flex flex-wrap gap-1.5">
                {ITEM_TYPES.filter((t) => t.type !== "song").map((t) => (
                  <button key={t.type} onClick={() => addBlock(t.type as Exclude<SetlistItemType, "song">)} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Plus className="h-3.5 w-3.5" />{t.label}<span className="font-normal text-slate-500 dark:text-slate-400">{formatDuration(t.duration)}</span>
                  </button>
                ))}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); addManualSong(); }}>
                <label htmlFor="manual-song" className="sr-only">曲を手入力で追加</label>
                <input id="manual-song" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="曲を手入力: 曲名 / P名" className={inputCls} />
                <button type="submit" disabled={!manual.trim()} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40"><Plus className="h-4 w-4" />曲を追加</button>
              </form>
              <p className="mt-1 text-xs text-slate-500">空きの曲枠（テンプレート）があれば先に埋まります。抽出結果からは「抽出」タブの「セトリに追加」で入れられます。</p>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-bold">書き出し・管理</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copyText(setlistToText(active), "テキストをコピーしました")} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-600 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"><Copy className="h-4 w-4" />テキストをコピー</button>
              <button onClick={() => copyText(setlistToTSV(active), "TSVをコピーしました（Excel・スプレッドシートにそのまま貼れます）")} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700"><Copy className="h-4 w-4" />TSVをコピー</button>
              <button onClick={doXlsx} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"><FileSpreadsheet className="h-4 w-4" />Excel</button>
              <button onClick={() => exportSetlistsJSON([active], active.name)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"><Download className="h-4 w-4" />このセトリをJSON</button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button onClick={registerPerformed} disabled={!hasSongs} className={cx(smallBtn, "text-slate-600 disabled:opacity-40 dark:text-slate-300")}><CalendarPlus className="h-4 w-4" />曲を演奏済みリストに登録</button>
              <button onClick={duplicateList} className={cx(smallBtn, "text-slate-600 dark:text-slate-300")}><Copy className="h-4 w-4" />このセトリを複製</button>
              {armedDelete ? (
                <span className="ml-auto flex items-center gap-1">
                  <span className="text-xs font-bold text-rose-600">削除しますか？</span>
                  <button onClick={deleteList} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700">削除する</button>
                  <button onClick={() => setArmedId(null)} className={smallBtn}>やめる</button>
                </span>
              ) : (
                <button onClick={() => setArmedId(active.id)} className={cx(smallBtn, "ml-auto text-rose-600")}><Trash2 className="h-4 w-4" />このセトリを削除</button>
              )}
            </div>
          </Card>
        </>
      )}

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createList} />
    </div>
  );
}

/* ---------- 1項目 ---------- */

function ItemRow({ it, index, last, start, songNo, clock, dup, performed, onChange, onMove, onDuplicate, onRemove }: {
  it: SetlistItem; index: number; last: boolean; start: string; songNo?: number; clock: boolean; dup: boolean; performed: boolean;
  onChange: (p: Partial<SetlistItem>) => void; onMove: (to: number) => void; onDuplicate: () => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [badDur, setBadDur] = useState(false);
  const song = it.type === "song";
  const cam = song ? camelotOf(it.key) : undefined;
  const label = it.title || typeLabel(it.type);
  const tone = song ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200" : it.type === "mc" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
  const arrow = "grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-25 dark:hover:bg-slate-800";
  const num = (v: string) => { const n = Number(v.replace(/[^0-9.]/g, "")); return v.trim() && Number.isFinite(n) && n > 0 && n < 1000 ? n : undefined; };

  return (
    <li className={cx("rounded-2xl border p-2.5", it.placeholder ? "border-dashed border-slate-300 dark:border-slate-700" : "border-slate-200 dark:border-slate-800", (dup || performed) && "border-amber-400 bg-amber-50/50 dark:border-amber-500/50 dark:bg-amber-500/5")}>
      <div className="flex items-start gap-1.5">
        <div className="flex shrink-0 flex-col">
          <button onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={`${label}を上へ`} className={arrow}><ArrowUp className="h-4 w-4" /></button>
          <button onClick={() => onMove(index + 1)} disabled={last} aria-label={`${label}を下へ`} className={arrow}><ArrowDown className="h-4 w-4" /></button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold tabular-nums text-slate-500" title={clock ? "開始時刻" : "開始までの経過"}>{start}</span>
            <span className={cx("rounded-md px-1.5 py-0.5 font-bold", tone)}>{typeLabel(it.type)}{songNo ? ` ${songNo}` : ""}</span>
            {it.placeholder && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-slate-800">空き枠</span>}
            {dup && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">重複</span>}
            {performed && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">演奏済み</span>}
            {song && it.bpm && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">BPM {it.bpm}</span>}
            {song && it.key && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{it.key}{cam ? `（${cam}）` : ""}</span>}
            {song && it.mmd === "あり" && <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-purple-800 dark:bg-purple-500/20 dark:text-purple-200">MMD</span>}
          </div>
          <input aria-label={`${index + 1}番目の${song ? "曲名" : "項目名"}`} value={it.title} maxLength={200} onChange={(e) => onChange({ title: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) onChange({ title: typeLabel(it.type) }); }}
            className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-base font-bold outline-none hover:border-slate-200 focus:border-indigo-500 dark:hover:border-slate-700 sm:text-sm" />
          {song && (it.producer || it.vocal) && <p className="px-1 text-xs text-slate-500">{[it.producer, it.vocal].filter(Boolean).join(" ・ ")}</p>}
        </div>
        <div className="shrink-0">
          <label className="sr-only" htmlFor={`dur-${it.id}`}>長さ（mm:ss）</label>
          <input id={`dur-${it.id}`} key={`${it.id}:${it.duration}`} defaultValue={formatDuration(it.duration)} inputMode="numeric" aria-invalid={badDur} placeholder="4:00"
            onChange={() => setBadDur(false)}
            onBlur={(e) => { const sec = parseDuration(e.target.value); if (sec === null) { setBadDur(true); e.target.value = formatDuration(it.duration); } else { setBadDur(false); if (sec !== it.duration) onChange({ duration: sec }); else e.target.value = formatDuration(sec); } }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className={cx("w-[4.5rem] rounded-lg border bg-white px-2 py-2 text-center text-base tabular-nums outline-none focus:border-indigo-500 dark:bg-slate-950 sm:text-sm", badDur ? "border-rose-500" : "border-slate-300 dark:border-slate-700")} />
          {badDur && <p className="mt-0.5 w-[4.5rem] text-center text-[10px] font-bold text-rose-600">例 4:00</p>}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1 pl-[2.625rem]">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cx(smallBtn, "text-slate-600 dark:text-slate-300")}>詳細・メモ<ChevronDown className={cx("h-3.5 w-3.5 transition", open && "rotate-180")} />{!open && it.notes && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-indigo-500" aria-label="メモあり" />}</button>
        <button onClick={onDuplicate} aria-label={`${label}を複製`} className={cx(smallBtn, "text-slate-600 dark:text-slate-300")}><Copy className="h-3.5 w-3.5" />複製</button>
        <button onClick={onRemove} aria-label={`${label}を削除`} className={cx(smallBtn, "ml-auto text-rose-600")}><Trash2 className="h-3.5 w-3.5" />削除</button>
      </div>
      {open && (
        <div className="mt-2 grid gap-3 pl-[2.625rem] sm:grid-cols-2">
          {song && (
            <>
              <Field label="ボカロP">{(id) => <input id={id} value={it.producer ?? ""} maxLength={200} onChange={(e) => onChange({ producer: e.target.value || undefined })} className={inputCls} />}</Field>
              <Field label="合成音声">{(id) => <input id={id} value={it.vocal ?? ""} maxLength={200} onChange={(e) => onChange({ vocal: e.target.value || undefined })} className={inputCls} />}</Field>
              <Field label="BPM">{(id) => <input id={id} inputMode="decimal" defaultValue={it.bpm ?? ""} onChange={(e) => onChange({ bpm: num(e.target.value) })} className={inputCls} />}</Field>
              <Field label="Key" hint={cam ? `Camelot ${cam}` : "例: Am / F#m / 8A"}>{(id) => <input id={id} value={it.key ?? ""} maxLength={20} onChange={(e) => onChange({ key: e.target.value || undefined })} className={inputCls} />}</Field>
              <Field label="MMD">{(id) => (
                <select id={id} value={it.mmd ?? ""} onChange={(e) => onChange({ mmd: (e.target.value || undefined) as SetlistItem["mmd"] })} className={inputCls}>
                  <option value="">未設定</option><option value="あり">あり</option><option value="なし">なし</option><option value="不明">不明</option>
                </select>
              )}</Field>
              <Field label="動画URL">{(id) => <input id={id} type="url" value={it.url ?? ""} onChange={(e) => onChange({ url: /^https?:\/\//i.test(e.target.value) ? e.target.value : undefined })} placeholder="https://…" className={inputCls} />}</Field>
            </>
          )}
          <div className="sm:col-span-2">
            <Field label="メモ（照明・演出・転換など）">{(id) => <textarea id={id} rows={2} value={it.notes ?? ""} maxLength={1000} onChange={(e) => onChange({ notes: e.target.value || undefined })} className={inputCls} />}</Field>
          </div>
        </div>
      )}
    </li>
  );
}

/* ---------- 新規作成 ---------- */

function CreateModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (o: Parameters<typeof createSetlist>[0]) => void }) {
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState("standard");
  const [date, setDate] = useState("");
  const [theme, setTheme] = useState("");
  const [startTime, setStartTime] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="セトリを作る" size="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="公演名">{(id) => <input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="例: 秋のボカロライブ" className={inputCls} />}</Field>
          <Field label="テーマ（任意）">{(id) => <input id={id} value={theme} maxLength={60} list="create-themes" onChange={(e) => setTheme(e.target.value)} className={inputCls} />}</Field>
          <Field label="日付（任意）">{(id) => <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />}</Field>
          <Field label="開始時刻（任意）">{(id) => <input id={id} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />}</Field>
        </div>
        <datalist id="create-themes">{THEME_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
        <div role="radiogroup" aria-label="テンプレート" className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tpl === t.id} onClick={() => setTpl(t.id)}
              className={cx("rounded-2xl border-2 px-4 py-3 text-left", tpl === t.id ? "border-indigo-600 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/15" : "border-slate-200 dark:border-slate-800")}>
              <span className="block text-sm font-bold">{t.name}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} className="rounded-xl bg-slate-100 py-3 font-bold hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">キャンセル</button>
          <button onClick={() => { onCreate({ name, templateId: tpl, date, theme, startTime: parseClock(startTime) !== null ? startTime : undefined }); setName(""); setTheme(""); setDate(""); setStartTime(""); }} className="rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700">作成する</button>
        </div>
      </div>
    </Modal>
  );
}
