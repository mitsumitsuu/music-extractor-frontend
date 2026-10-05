"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- ボタンの共通スタイル（Material 3 の Filled / Tonal / Outlined / Text に対応） ---------- */
export const btn = {
  base: "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-45",
  filled: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700",
  tonal: "bg-indigo-50 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-100 dark:hover:bg-indigo-500/25",
  outlined: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  text: "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  icon: "grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800",
};

/* ---------- Toast ---------- */
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; text: string; tone: "ok" | "err" | "info"; action?: ToastAction };
type PushToast = (text: string, tone?: Toast["tone"], action?: ToastAction) => void;
const ToastCtx = createContext<PushToast>(() => {});
export const useToast = () => useContext(ToastCtx);
let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), []);
  const push = useCallback<PushToast>((text, tone = "ok", action) => {
    const id = ++toastSeq;
    setItems((x) => [...x.slice(-2), { id, text, tone, action }]);
    setTimeout(() => dismiss(id), action ? 7000 : 3600);
  }, [dismiss]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-36 z-[200] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={cx(
                "pointer-events-auto flex max-w-md items-center gap-3 rounded-xl py-2.5 pl-4 text-sm font-bold shadow-lg",
                t.action ? "pr-2" : "pr-4",
                t.tone === "ok" && "bg-emerald-700 text-white",
                t.tone === "err" && "bg-rose-700 text-white",
                t.tone === "info" && "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900",
              )}
            >
              <span>{t.text}</span>
              {t.action && (
                <button onClick={() => { t.action?.onClick(); dismiss(t.id); }} className="min-h-9 shrink-0 rounded-lg px-3 underline-offset-2 hover:bg-white/15 hover:underline">
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Modal（スマホでは下からのシート表示） ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open, onClose, title, children, size = "md", fixed, toolbar,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** md=28rem / lg=42rem（どの内容でも幅は一定） */
  size?: "md" | "lg";
  /** 高さも固定する（タブで中身が切り替わる画面向け。中身はスクロール） */
  fixed?: boolean;
  /** タイトル直下に固定表示する領域（タブ等。スクロールしない） */
  toolbar?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      // フォーカスをダイアログ内に閉じ込める（キーボード・読み上げ利用者向け）
      if (e.key === "Tab" && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => ref.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <motion.div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            tabIndex={-1}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className={cx(
              "relative flex w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl outline-none dark:bg-slate-900 sm:rounded-[28px]",
              size === "lg" ? "sm:w-[42rem]" : "sm:w-[28rem]",
              fixed ? "h-[88dvh] sm:h-[min(40rem,calc(100dvh-3rem))]" : "max-h-[90dvh]",
            )}
          >
            <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" aria-hidden />
            <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-3 sm:px-6 sm:pt-5">
              <h2 id={titleId} className="text-xl font-bold">{title}</h2>
              <button onClick={onClose} className={btn.icon} aria-label="閉じる">
                <X className="h-5 w-5" />
              </button>
            </div>
            {toolbar && <div className="shrink-0 border-b border-slate-200 px-5 pb-3 dark:border-slate-800 sm:px-6">{toolbar}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">{children}</div>
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
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export const inputCls =
  "min-h-11 w-full rounded-xl border border-slate-400 bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none transition placeholder:text-slate-500 hover:border-slate-500 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 sm:text-sm";

export function Switch({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl px-1 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        {desc && <span className="block text-xs leading-relaxed text-slate-600 dark:text-slate-400">{desc}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-8 w-[3.25rem] rounded-full border-2 border-slate-400 bg-slate-200 transition peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-700 dark:border-slate-500 dark:bg-slate-700" />
        <span className="absolute left-1.5 top-1.5 h-5 w-5 rounded-full bg-slate-500 shadow transition peer-checked:translate-x-5 peer-checked:bg-white dark:bg-slate-300" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; desc?: string; icon?: ReactNode }[]; label?: string }) {
  return (
    <div className="@container">
    <div className="grid gap-2 @lg:grid-cols-3" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex min-h-11 items-start gap-2 rounded-2xl border-2 px-4 py-3 text-left transition",
            value === o.value
              ? "border-indigo-600 bg-indigo-50 text-indigo-950 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-50"
              : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-500",
          )}
        >
          {o.icon && <span className={cx("mt-0.5 shrink-0", value === o.value ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500")}>{o.icon}</span>}
          <span className="min-w-0">
            <span className="block text-sm font-bold">{o.label}</span>
            {o.desc && <span className="mt-0.5 block text-xs leading-relaxed text-slate-600 dark:text-slate-400">{o.desc}</span>}
          </span>
        </button>
      ))}
    </div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-6", className)}>{children}</section>;
}

export function Confirm({ open, title, body, okLabel, danger, onOk, onCancel }: { open: boolean; title: string; body: string; okLabel: string; danger?: boolean; onOk: (dontAsk: boolean) => void; onCancel: () => void }) {
  const [dontAsk, setDontAsk] = useState(false);
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{body}</p>
      <label className="mt-4 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="h-5 w-5 accent-indigo-600" />
        次回から確認しない
      </label>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={onCancel} className={cx(btn.base, btn.outlined)}>キャンセル</button>
        <button onClick={() => onOk(dontAsk)} className={cx(btn.base, danger ? btn.danger : btn.filled)}>{okLabel}</button>
      </div>
    </Modal>
  );
}
