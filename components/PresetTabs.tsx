"use client";

import { Reorder } from "framer-motion";
import { Loader2, Plus, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import type { Preset } from "@/lib/types";
import { cx } from "./ui";

export const presetTabId = (id: string) => `preset-tab-${id}`;
export const PRESET_PANEL_ID = "preset-panel";

/**
 * Chrome のようなタブ列。
 * - クリックで切替、ダブルクリック / F2 で名前変更、× / Delete / ホイールクリックで閉じる
 * - ← → Home End でタブ移動（WAI-ARIA Tabs パターン）
 * - マウス操作の端末ではドラッグで並べ替え
 */
export function PresetTabs({
  presets, activeId, busyId, max, finePointer, renaming, setRenaming, onSelect, onAdd, onClose, onRename, onReorder,
}: {
  presets: Preset[];
  activeId: string;
  /** 抽出中のタブ（くるくる表示） */
  busyId: string | null;
  max: number;
  finePointer: boolean;
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (list: Preset[]) => void;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [dragging, setDragging] = useState(false);
  const activeIndex = presets.findIndex((p) => p.id === activeId);

  const focusTab = (i: number) => {
    const p = presets[(i + presets.length) % presets.length];
    onSelect(p.id);
    requestAnimationFrame(() => refs.current.get(p.id)?.focus());
  };
  const onKey = (e: KeyboardEvent, i: number, id: string) => {
    if (e.key === "ArrowRight") focusTab(i + 1);
    else if (e.key === "ArrowLeft") focusTab(i - 1);
    else if (e.key === "Home") focusTab(0);
    else if (e.key === "End") focusTab(presets.length - 1);
    else if (e.key === "Delete") onClose(id);
    else if (e.key === "F2") setRenaming(id);
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex items-end gap-1">
      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide">
        <Reorder.Group
          as="div"
          axis="x"
          values={presets}
          onReorder={onReorder}
          role="tablist"
          aria-label="プリセット（タブ）"
          className="flex min-w-full items-end pt-1"
        >
          {presets.map((p, i) => {
            const active = p.id === activeId;
            // 非アクティブ同士の間にだけ区切り線（Chrome と同じ見た目）
            const divider = i < presets.length - 1 && !active && i + 1 !== activeIndex;
            return (
              <Reorder.Item
                key={p.id}
                value={p}
                as="div"
                role="presentation"
                dragListener={finePointer && renaming !== p.id}
                onDragStart={() => setDragging(true)}
                onDragEnd={() => setDragging(false)}
                className={cx(
                  "chrome-tab group relative flex h-11 max-w-[15rem] flex-1 basis-0 items-center rounded-t-xl",
                  active ? "is-active z-10 min-w-[9.5rem] bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-50" : "min-w-[7.5rem] text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-800/70",
                  i === 0 && "is-first",
                )}
              >
                {renaming === p.id ? (
                  <input
                    autoFocus
                    aria-label="タブの名前"
                    defaultValue={p.name}
                    maxLength={40}
                    onPointerDown={(e) => e.stopPropagation()}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v) onRename(p.id, v); setRenaming(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }}
                    className="mx-1.5 h-8 min-w-0 flex-1 rounded-lg border border-indigo-500 bg-white px-2 text-sm font-bold text-slate-900 outline-none dark:bg-slate-950 dark:text-slate-50"
                  />
                ) : (
                  <button
                    ref={(el) => { if (el) refs.current.set(p.id, el); else refs.current.delete(p.id); }}
                    id={presetTabId(p.id)}
                    role="tab"
                    aria-selected={active}
                    aria-controls={PRESET_PANEL_ID}
                    aria-keyshortcuts="Delete F2"
                    tabIndex={active ? 0 : -1}
                    title={`${p.name}（ダブルクリックで名前変更）`}
                    onClick={() => { if (!dragging) onSelect(p.id); }}
                    onDoubleClick={() => setRenaming(p.id)}
                    onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(p.id); } }}
                    onKeyDown={(e) => onKey(e, i, p.id)}
                    className={cx("flex h-full min-w-0 flex-1 items-center gap-2 rounded-t-xl pl-3.5 text-left text-sm font-bold", active ? "pr-9" : "pr-3")}
                  >
                    {busyId === p.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600 dark:text-indigo-300" aria-label="抽出中" />}
                    <span className="truncate">{p.name}</span>
                  </button>
                )}
                {renaming !== p.id && (
                  <button
                    tabIndex={-1}
                    onClick={() => onClose(p.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={`${p.name}を閉じる`}
                    title="タブを閉じる（Delete）"
                    className={cx(
                      "absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-500 hover:bg-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white",
                      // 非選択タブはマウスを乗せたときだけ（名前の末尾に重ねて表示）。タッチ端末は選択中タブのみ
                      active ? "opacity-100" : "pointer-events-none bg-slate-200 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 dark:bg-slate-800 [@media(pointer:coarse)]:hidden",
                    )}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {divider && <span className="pointer-events-none absolute right-0 top-1/2 h-5 w-px -translate-y-1/2 bg-slate-300 group-hover:opacity-0 dark:bg-slate-700" aria-hidden />}
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      </div>
      <button
        onClick={onAdd}
        disabled={presets.length >= max}
        title={presets.length >= max ? `タブは最大${max}個です` : "新しいタブ"}
        aria-label="新しいタブ（プリセット）を追加"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-200 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
