"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- Toast ---------- */
type Toast = { id: number; text: string; tone: "ok" | "err" | "info" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[200] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={cx(
                "pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg",
                t.tone === "ok" && "bg-emerald-600 text-white",
                t.tone === "err" && "bg-rose-600 text-white",
                t.tone === "info" && "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900",
              )}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Modal（スマホでは下からのシート表示） ---------- */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => ref.current?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            tabIndex={-1}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={cx(
              "relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none dark:bg-slate-900 sm:rounded-3xl",
              wide ? "sm:max-w-2xl" : "sm:max-w-md",
            )}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 className="text-lg font-bold">{title}</h2>
              <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="閉じる">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ---------- 入力部品 ---------- */
export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-slate-600 dark:text-slate-300">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:text-sm";

export function Switch({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-1 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        {desc && <span className="block text-xs text-slate-500 dark:text-slate-400">{desc}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 peer-focus-visible:ring-4 peer-focus-visible:ring-indigo-500/30 dark:bg-slate-700" />
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; desc?: string }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-2xl border-2 px-4 py-3 text-left transition",
            value === o.value
              ? "border-indigo-600 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-100"
              : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700",
          )}
        >
          <span className="block text-sm font-bold">{o.label}</span>
          {o.desc && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{o.desc}</span>}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6", className)}>{children}</section>;
}

export function Confirm({ open, title, body, okLabel, danger, onOk, onCancel }: { open: boolean; title: string; body: string; okLabel: string; danger?: boolean; onOk: (dontAsk: boolean) => void; onCancel: () => void }) {
  const [dontAsk, setDontAsk] = useState(false);
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{body}</p>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
        次回から確認しない
      </label>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button onClick={onCancel} className="rounded-xl bg-slate-100 py-3 font-bold hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">キャンセル</button>
        <button onClick={() => onOk(dontAsk)} className={cx("rounded-xl py-3 font-bold text-white", danger ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700")}>
          {okLabel}
        </button>
      </div>
    </Modal>
  );
}
