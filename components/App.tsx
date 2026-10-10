"use client";

import { ClipboardList, Copy, History, ListMusic, Loader2, LogIn, Moon, Music2, Pencil, Play, RefreshCw, Settings, Share2, Sparkles, Sun, X } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exportJSON } from "@/lib/exporters";
import { appendSpeechText } from "@/lib/speech-input";
import { MAX_PERFORMED_TEXT, appendPerformed, parsePerformed, performedKeySet } from "@/lib/performed";
import { addSongsToSetlist, createSetlist, mergeSetlists, parseSetlistBackup, sanitizeSetlist, type Setlist } from "@/lib/setlist";
import { createPreset, decodeSharedPreset, encodePresetForShare, newId, sanitizePreset, store, type HistoryEntry, type Prefs } from "@/lib/storage";
import type { ApiKeys, ExtractResponse, HealthResponse, Preset, Song, UploadFile } from "@/lib/types";
import { ExtractForm } from "./ExtractForm";
import { PerformedModal } from "./PerformedModal";
import { PlaylistTool } from "./PlaylistTool";
import { PRESET_PANEL_ID, PresetTabs, presetTabId } from "./PresetTabs";
import { Results } from "./Results";
import { SettingsModal, type SettingsTab } from "./SettingsModal";
import type { SetlistTarget } from "./SetlistAddModal";
import { SetlistView } from "./SetlistView";
import { Confirm, ToastProvider, btn, cx, useToast } from "./ui";

const MAX_PRESETS = 10;
const MAX_SETLISTS = 50;
type View = "extract" | "setlist" | "playlist" | "history";
const NAV_ITEMS = [["extract", "抽出", Sparkles], ["setlist", "セトリ", ClipboardList], ["playlist", "プレイリスト", ListMusic], ["history", "履歴", History]] as const;

type ResultState = { historyId: string; songs: Song[]; warnings: string[]; meta?: ExtractResponse["meta"]; name: string };

const omit = <T,>(rec: Record<string, T>, key: string): Record<string, T> => {
  const next = { ...rec };
  delete next[key];
  return next;
};

function loadSetlists(): Setlist[] {
  const seen = new Set<string>();
  return store.loadSetlistsRaw().map((r) => sanitizeSetlist(r)).filter((s): s is Setlist => !!s && !seen.has(s.id) && !!seen.add(s.id)).slice(0, MAX_SETLISTS);
}

function loadKeys(remember: boolean): ApiKeys {
  if (remember) return store.loadKeys();
  try {
    return JSON.parse(window.sessionStorage.getItem("mx:keys:session") ?? "{}") as ApiKeys;
  } catch {
    return {};
  }
}

/** 共有リンク（?preset=...）があれば新しいタブとして読み込む */
function initialPresets(): { presets: Preset[]; active: string; shared: boolean } {
  const presets = store.loadPresets();
  let active = store.loadActive();
  let shared = false;
  try {
    const param = new URLSearchParams(window.location.search).get("preset");
    const p = param && param.length < 100_000 ? decodeSharedPreset(param) : null;
    if (p) {
      p.name = `${p.name}（共有）`.slice(0, 40);
      if (presets.length >= MAX_PRESETS) presets.pop();
      presets.push(p);
      active = p.id;
      shared = true;
    }
  } catch {
    /* ignore */
  }
  if (!presets.some((p) => p.id === active)) active = presets[0].id;
  return { presets, active, shared };
}

/**
 * 入力のたびに localStorage へ書き込まないよう、少し待ってからまとめて保存する。
 * ページを離れる・バックグラウンドに回るときは即保存（ログインで画面遷移しても失われない）。
 */
function usePersist<T>(value: T, save: (v: T) => void, delay = 400) {
  const pending = useRef<{ v: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    pending.current = { v: value };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (pending.current) save(pending.current.v);
      pending.current = null;
    }, delay);
  }, [value, save, delay]);
  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current);
      if (pending.current) save(pending.current.v);
      pending.current = null;
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [save]);
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const toast = useToast();
  const [init] = useState(initialPresets);
  const [presets, setPresets] = useState<Preset[]>(init.presets);
  const [activeId, setActiveId] = useState<string>(init.active);
  const [prefs, setPrefs] = useState<Prefs>(() => store.loadPrefs());
  const [keys, setKeys] = useState<ApiKeys>(() => loadKeys(store.loadPrefs().rememberKeys));
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [filesBy, setFilesBy] = useState<Record<string, UploadFile[]>>({});
  const [results, setResults] = useState<Record<string, ResultState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [speechActive, setSpeechActive] = useState(false);
  const speechActiveRef = useRef(false);
  const onSpeechActiveChange = useCallback((next: boolean) => { speechActiveRef.current = next; setSpeechActive(next); }, []);
  const [view, setView] = useState<View>("extract");
  const [setlists, setSetlists] = useState<Setlist[]>(loadSetlists);
  const [setlistId, setSetlistId] = useState("");
  const [performedText, setPerformedText] = useState(() => store.loadPerformed());
  const [performedOpen, setPerformedOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => store.loadHistory());
  const [elapsed, setElapsed] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("keys");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "delete" | "reset"; id: string }>(null);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [finePointer] = useState(() => window.matchMedia("(pointer: fine)").matches);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activeId);

  const active = presets.find((p) => p.id === activeId) ?? presets[0];
  const activeIndex = presets.indexOf(active);
  const result = results[active.id] ?? null;
  const error = errors[active.id] ?? "";
  const loading = busyId !== null;
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark);
  const auth = health?.auth;
  const needLogin = !!auth?.required && !auth.user;

  /* ---- 永続化・副作用 ---- */
  usePersist(presets, store.savePresets);
  usePersist(activeId, store.saveActive);
  usePersist(prefs, store.savePrefs, 0);
  usePersist(history, store.saveHistory, 800);
  usePersist(setlists, store.saveSetlists);
  usePersist(performedText, store.savePerformed);
  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  useEffect(() => {
    if (prefs.rememberKeys) {
      store.saveKeys(keys);
      try { window.sessionStorage.removeItem("mx:keys:session"); } catch { /* ignore */ }
    } else {
      store.saveKeys(null);
      try { window.sessionStorage.setItem("mx:keys:session", JSON.stringify(keys)); } catch { /* ignore */ }
    }
  }, [keys, prefs.rememberKeys]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b1120" : "#f1f5f9");
  }, [dark]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : null))
      .then((h) => { if (alive) setHealth(h); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  // 共有リンク・ログイン失敗の通知（URL の一時パラメータは表示後に消す）
  useEffect(() => {
    const url = new URL(window.location.href);
    const err = url.searchParams.get("error");
    if (init.shared) toast("共有されたプリセットを新しいタブで開きました", "info");
    if (err) toast(err === "AccessDenied" ? "このGoogleアカウントではログインできませんでした（メールアドレス未確認など）" : "ログインに失敗しました。時間をおいて再度お試しください。", "err");
    if (!init.shared && !err) return;
    for (const k of ["preset", "error", "code"]) url.searchParams.delete(k);
    window.history.replaceState(null, "", url.toString());
  }, [init.shared, toast]);
  useEffect(() => {
    if (!loading) return;
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => { clearInterval(iv); setElapsed(0); };
  }, [loading]);

  const update = useCallback((u: Partial<Preset>) => setPresets((ps) => ps.map((p) => (p.id === activeId ? { ...p, ...u } : p))), [activeId]);
  const appendSpeech = useCallback((id: string, text: string) => setPresets((ps) => ps.map((p) => p.id === id ? { ...p, usePaste: true, pastedText: appendSpeechText(p.pastedText, text) } : p)), []);
  const canLeaveSpeechInput = () => {
    if (!speechActiveRef.current) return true;
    toast("音声入力を停止してから操作してください。", "info");
    return false;
  };
  const selectPreset = (id: string) => { if (id === activeId || canLeaveSpeechInput()) setActiveId(id); };
  const changeView = (next: View) => { if (next === view || canLeaveSpeechInput()) setView(next); };
  const login = () => { if (canLeaveSpeechInput()) void signIn("google"); };
  const logout = () => { if (canLeaveSpeechInput()) void signOut({ redirectTo: "/" }); };
  const openSettings = (tab: SettingsTab) => { setSettingsTab(tab); setSettingsOpen(true); };

  /* ---- タブ（プリセット）操作 ---- */
  const addPreset = () => {
    if (!canLeaveSpeechInput()) return;
    if (presets.length >= MAX_PRESETS) { toast(`タブは最大${MAX_PRESETS}個です`, "err"); return; }
    const used = new Set(presets.map((p) => p.name));
    let n = presets.length + 1;
    while (used.has(`プリセット ${n}`)) n++;
    const p = createPreset(`プリセット ${n}`);
    setPresets((ps) => [...ps, p]);
    setActiveId(p.id);
  };
  const duplicate = () => {
    if (!canLeaveSpeechInput()) return;
    if (presets.length >= MAX_PRESETS) { toast(`タブは最大${MAX_PRESETS}個です`, "err"); return; }
    const p = { ...structuredClone(active), id: newId(), name: `${active.name} のコピー`.slice(0, 40) };
    setPresets((ps) => { const n = ps.slice(); n.splice(ps.indexOf(active) + 1, 0, p); return n; });
    setActiveId(p.id);
    toast("タブを複製しました");
  };
  const closeTab = (id: string) => {
    if (!canLeaveSpeechInput()) return;
    if (presets.length <= 1) { toast("タブは最低1つ必要です", "err"); return; }
    if (busyId === id) abortRef.current?.abort();
    const idx = presets.findIndex((p) => p.id === id);
    const removed = presets[idx];
    const saved = { result: results[id], files: filesBy[id] };
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    // Chrome と同じく、閉じたタブの右隣（無ければ左隣）を選ぶ
    if (activeId === id) setActiveId(next[Math.min(idx, next.length - 1)].id);
    setResults((r) => omit(r, id));
    setFilesBy((f) => omit(f, id));
    setErrors((e) => omit(e, id));
    toast(`「${removed.name}」を閉じました`, "info", {
      label: "元に戻す",
      onClick: () => {
        if (!canLeaveSpeechInput()) return;
        setPresets((ps) => (ps.length >= MAX_PRESETS || ps.some((p) => p.id === id) ? ps : [...ps.slice(0, idx), removed, ...ps.slice(idx)]));
        setActiveId(id);
        if (saved.result) setResults((r) => ({ ...r, [id]: saved.result }));
        if (saved.files) setFilesBy((f) => ({ ...f, [id]: saved.files }));
      },
    });
  };
  const requestClose = (id: string) => {
    if (!canLeaveSpeechInput()) return;
    if (prefs.confirmDelete) setConfirm({ kind: "delete", id });
    else closeTab(id);
  };
  const requestReset = () => {
    if (!canLeaveSpeechInput()) return;
    if (prefs.confirmReset) setConfirm({ kind: "reset", id: active.id });
    else doReset(active.id);
  };
  const doReset = (id: string) => {
    if (!canLeaveSpeechInput()) return;
    setPresets((ps) => ps.map((p) => (p.id === id ? { ...createPreset(p.name), id: p.id } : p)));
    setFilesBy((f) => omit(f, id));
  };
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?preset=${encodePresetForShare(active)}`;
    try {
      if (navigator.share && !finePointer) await navigator.share({ title: `楽曲抽出プリセット「${active.name}」`, url });
      else { await navigator.clipboard.writeText(url); toast("共有リンクをコピーしました（APIキーは含まれません）"); }
    } catch { /* キャンセル */ }
  };

  /* ---- 抽出（どのタブで始めたかを覚えておき、結果はそのタブに入れる） ---- */
  const files = filesBy[active.id] ?? [];
  const canStart = (active.useUrl && active.url.trim()) || (active.usePaste && active.pastedText.trim()) || (active.useFile && files.length > 0);
  const setErr = (id: string, msg: string) => setErrors((e) => (msg ? { ...e, [id]: msg } : omit(e, id)));

  const start = async () => {
    if (busyId) return;
    const p = active;
    if (speechActiveRef.current) { setErr(p.id, "音声入力を停止してから抽出してください。"); return; }
    if (!canStart) { setErr(p.id, "URL・テキスト・ファイルのいずれかを入力してください。"); return; }
    if (needLogin) { setErr(p.id, "抽出するにはログインしてください。"); return; }
    setErr(p.id, "");
    setBusyId(p.id);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        signal: ac.signal,
        headers: { "Content-Type": "application/json", ...(prefs.passcode ? { "x-app-passcode": prefs.passcode } : {}) },
        body: JSON.stringify({
          urls: p.useUrl ? p.url.split(/\s+/).filter(Boolean) : [],
          text: p.usePaste ? p.pastedText : "",
          files: p.useFile ? files : [],
          mode: p.mode,
          provider: p.provider,
          filters: p.filters,
          links: p.links,
          keys: { youtube: keys.youtube || undefined, gemini: keys.gemini || undefined, openai: keys.openai || undefined },
        }),
      });
      const raw = await res.text();
      let data: (ExtractResponse & { error?: string }) | null = null;
      try { data = JSON.parse(raw) as ExtractResponse & { error?: string }; } catch { /* HTML エラーページ等 */ }
      if (!res.ok || !data) {
        const msg = data?.error ?? (res.status === 413 ? "送信データが大きすぎます。ファイルを減らしてください。" : res.status === 504 ? "処理に時間がかかりすぎました。URLや件数を減らして再試行してください。" : `サーバーエラー（${res.status}）`);
        throw new Error(msg);
      }
      const songs = data.songs;
      const historyId = newId();
      setResults((r) => ({ ...r, [p.id]: { historyId, songs, warnings: data.warnings, meta: data.meta, name: p.filename || p.name } }));
      const here = activeRef.current === p.id;
      if (songs.length) {
        setHistory((h) => [{ id: historyId, at: Date.now(), presetName: p.name, count: songs.length, songs }, ...h].slice(0, 20));
        toast(here ? `${songs.length}曲を抽出しました` : `「${p.name}」で${songs.length}曲を抽出しました`);
      } else toast("曲が見つかりませんでした", "info");
      if (here) setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      if ((e as Error).name === "AbortError") setErr(p.id, "抽出を中止しました。");
      else setErr(p.id, (e as Error).message || "通信エラーが発生しました。");
    } finally {
      setBusyId(null);
      abortRef.current = null;
    }
  };

  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && view === "extract" && !document.querySelector('[role="dialog"]')) { e.preventDefault(); void startRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const performedKeys = useMemo(() => performedKeySet(performedText), [performedText]);
  const hasUserKey = useMemo(() => ({ youtube: !!keys.youtube, ai: !!(keys.gemini || keys.openai) }), [keys]);

  /* ---- 抽出結果 → セトリ ---- */
  const addToSetlist = (songs: Song[], target: SetlistTarget) => {
    if (!songs.length) { toast("追加する曲がありません", "err"); return; }
    const base = "id" in target ? setlists.find((s) => s.id === target.id) : undefined;
    if ("id" in target && !base) { toast("セトリが見つかりません", "err"); return; }
    if (!base && setlists.length >= MAX_SETLISTS) { toast(`セトリは最大${MAX_SETLISTS}件です`, "err"); return; }
    const r = addSongsToSetlist(base ?? createSetlist({ name: "newName" in target ? target.newName : undefined }), songs);
    setSetlists((prev) => (base ? prev.map((s) => (s.id === r.setlist.id ? r.setlist : s)) : [...prev, r.setlist]));
    setSetlistId(r.setlist.id);
    toast(`「${r.setlist.name}」に${songs.length}曲を追加しました`, "ok", { label: "セトリを開く", onClick: () => changeView("setlist") });
  };

  const updateResultSongs = (songs: Song[]) => {
    if (!result) return;
    setResults((r) => ({ ...r, [active.id]: { ...result, songs } }));
    setHistory((entries) => entries.map((entry) => (entry.id === result.historyId ? { ...entry, songs, count: songs.length } : entry)));
  };

  /* ---- バックアップ（プリセット・セトリ・演奏済みリスト。APIキーは含めない） ---- */
  const backup = () =>
    exportJSON({ kind: "mx-backup", version: 3, exportedAt: new Date().toISOString(), presets: presets.map((p) => ({ ...p, id: undefined })), setlists, performed: performedText }, "music-extractor-backup.json");
  const restore = async (file: File): Promise<string> => {
    if (file.size > 20_000_000) throw new Error("too large");
    const text = await file.text();
    const j = JSON.parse(text) as Record<string, unknown>;
    const parts: string[] = [];
    const rawPresets = Array.isArray(j.presets) ? j.presets : [];
    const added = rawPresets.slice(0, Math.max(0, MAX_PRESETS - presets.length)).map((p) => ({ ...sanitizePreset(p as Partial<Preset> & Record<string, unknown>), id: newId() }));
    if (added.length) { setPresets((ps) => [...ps, ...added]); parts.push(`タブ${added.length}個`); }
    if (rawPresets.length > added.length) parts.push(`（上限のため${rawPresets.length - added.length}個は未追加）`);
    const sl = parseSetlistBackup(text);
    if (sl) {
      const m = mergeSetlists(setlists, sl);
      setSetlists(m.list.slice(0, MAX_SETLISTS));
      parts.push(`セトリ${m.added}件追加・${m.updated}件更新`);
    }
    if (typeof j.performed === "string" && j.performed.trim()) {
      const r = appendPerformed(performedText, parsePerformed(j.performed.slice(0, MAX_PERFORMED_TEXT)));
      if (r.added) { setPerformedText(r.text.slice(0, MAX_PERFORMED_TEXT)); parts.push(`演奏済み${r.added}曲`); }
    }
    if (!parts.length) throw new Error("empty");
    return `復元しました：${parts.join("・")}`;
  };

  const busyHere = busyId === active.id;
  const busyName = presets.find((p) => p.id === busyId)?.name;
  const startButton = speechActive ? (
    <button disabled className={cx(btn.base, "min-h-14 w-full rounded-2xl bg-slate-500 text-lg text-white dark:bg-slate-700")}>
      <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />音声入力中…
    </button>
  ) : needLogin ? (
    <button onClick={login} className={cx(btn.base, btn.filled, "min-h-14 w-full rounded-2xl text-lg")}>
      <LogIn className="h-5 w-5" />ログインして抽出
    </button>
  ) : loading ? (
    <button onClick={() => abortRef.current?.abort()} className={cx(btn.base, "min-h-14 w-full rounded-2xl bg-rose-600 text-lg text-white hover:bg-rose-700")}>
      <Loader2 className="h-5 w-5 animate-spin" />{busyHere ? "抽出中" : `「${busyName}」で抽出中`}… {elapsed}秒（タップで中止）
    </button>
  ) : (
    <button onClick={start} aria-disabled={!canStart} className={cx(btn.base, "min-h-14 w-full rounded-2xl text-lg text-white", canStart ? "bg-indigo-600 shadow-md hover:bg-indigo-700" : "bg-slate-500 dark:bg-slate-700")}>
      {active.mode === "ai" ? <Sparkles className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}抽出スタート
      <kbd className="ml-2 hidden rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-normal lg:inline">Ctrl+Enter</kbd>
    </button>
  );

  const tabActions = [
    { label: "名前変更", icon: Pencil },
    { label: "複製", icon: Copy },
    { label: "共有", icon: Share2 },
    { label: "初期化", icon: RefreshCw },
  ];
  const runTabAction = (label: string) => {
    if (label === "名前変更") setRenaming(active.id);
    else if (label === "複製") duplicate();
    else if (label === "共有") void share();
    else if (label === "初期化") requestReset();
  };
  const initial = auth?.user ? Array.from(auth.user.name || auth.user.email)[0]?.toUpperCase() : "";

  return (
    <div className="min-h-dvh bg-[var(--page)] text-slate-900 dark:text-slate-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-bold focus:text-indigo-800">本文へ移動</a>
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[var(--page)]/90 backdrop-blur-md dark:border-slate-800 print:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:gap-3 sm:px-6">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white" aria-hidden><Music2 className="h-5 w-5" /></div>
          <h1 className="truncate text-lg font-bold tracking-wide sm:text-xl">楽曲抽出システム</h1>
          <nav className="ml-6 hidden gap-1 md:flex" aria-label="メイン">
            {NAV_ITEMS.map(([v, label, Icon]) => (
              <button key={v} onClick={() => changeView(v)} aria-current={view === v ? "page" : undefined} className={cx("flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold", view === v ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-200" : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white")}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-0.5">
            <button onClick={() => setPrefs({ ...prefs, theme: dark ? "light" : "dark" })} className={btn.icon} aria-label={dark ? "ライトモードにする" : "ダークモードにする"}>
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button onClick={() => openSettings("keys")} className="relative flex min-h-11 items-center gap-1.5 rounded-full px-3 text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="設定">
              <Settings className="h-5 w-5" /><span className="hidden text-sm font-bold sm:inline">設定</span>
              {!health?.gemini && !health?.openai && !keys.gemini && !keys.openai && <span className="absolute right-1.5 top-2 h-2 w-2 rounded-full bg-amber-500 sm:static" title="AIキー未設定" />}
            </button>
            {auth?.enabled && (auth.user ? (
              <button onClick={() => openSettings("general")} className="grid h-11 w-11 place-items-center rounded-full hover:bg-slate-200/70 dark:hover:bg-slate-800" aria-label={`アカウント（${auth.user.email}）`} title={auth.user.email}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white">{initial}</span>
              </button>
            ) : (
              <button onClick={login} className={cx(btn.base, btn.filled, "ml-1 min-h-10 px-3")}>
                <LogIn className="h-4 w-4" />ログイン
              </button>
            ))}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-3 pb-44 pt-3 sm:px-6 md:pb-16">
        {view === "extract" && (
          <>
            {needLogin && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-50 print:hidden">
                <LogIn className="h-5 w-5 shrink-0" aria-hidden />
                <p className="min-w-0 flex-1">抽出するには Google アカウントでログインしてください。入力内容はこの端末に保存されたままです。</p>
                <button onClick={login} className={cx(btn.base, btn.filled)}>Googleでログイン</button>
              </div>
            )}

            {/* Chrome 風のタブ（＝プリセット） */}
            <div className="print:hidden">
              <PresetTabs
                presets={presets}
                activeId={active.id}
                busyId={busyId}
                max={MAX_PRESETS}
                finePointer={finePointer}
                renaming={renaming}
                setRenaming={setRenaming}
                onSelect={selectPreset}
                onAdd={addPreset}
                onClose={requestClose}
                onRename={(id, name) => setPresets((ps) => ps.map((x) => (x.id === id ? { ...x, name } : x)))}
                onReorder={setPresets}
              />
            </div>
            <div
              id={PRESET_PANEL_ID}
              role="tabpanel"
              aria-labelledby={presetTabId(active.id)}
              className={cx("relative rounded-3xl bg-[var(--surface)] p-3 shadow-sm sm:p-5 print:bg-transparent print:p-0 print:shadow-none", activeIndex === 0 && "rounded-tl-none")}
            >
              <div className="-mx-1 mb-3 flex items-center gap-0.5 overflow-x-auto px-1 text-sm scrollbar-hide print:hidden" role="toolbar" aria-label="このタブの操作">
                {tabActions.map((a) => (
                  <button key={a.label} onClick={() => runTabAction(a.label)} className={cx(btn.base, btn.text, "min-h-10 shrink-0 px-2 sm:px-3")}>
                    <a.icon className="h-4 w-4" />{a.label}
                  </button>
                ))}
                <span className="ml-auto hidden text-xs text-slate-600 dark:text-slate-400 lg:inline">自動保存・ダブルクリックで名前変更・ドラッグで並べ替え・ホイールクリックで閉じる</span>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
                <div className="min-w-0 lg:col-span-5 print:hidden">
                  <ExtractForm preset={active} update={update} files={files} setFiles={(f) => setFilesBy((x) => ({ ...x, [active.id]: f }))} health={health} hasUserKey={hasUserKey} appendSpeech={(text) => appendSpeech(active.id, text)} onSpeechActiveChange={onSpeechActiveChange} busy={loading} />
                  {error && <p role="alert" className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">{error}</p>}
                  <div className="mt-4 hidden md:block">{startButton}</div>
                </div>
                <div ref={resultsRef} className="min-w-0 scroll-mt-20 lg:col-span-7">
                  {result ? (
                    <Results key={result.historyId} songs={result.songs} setSongs={updateResultSongs} name={result.name} meta={result.meta} warnings={result.warnings} dark={dark} performedKeys={performedKeys} onOpenPerformed={() => setPerformedOpen(true)} setlists={setlists} onAddToSetlist={addToSetlist} />
                  ) : (
                    <div className="hidden rounded-3xl border-2 border-dashed border-slate-300 p-10 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400 lg:block">
                      {busyHere ? <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-indigo-500" /> : <Music2 className="mx-auto mb-3 h-10 w-10 text-indigo-500" />}
                      <p className="font-bold">{busyHere ? "抽出しています…" : "ここに抽出結果が表示されます"}</p>
                      <p className="mt-1 text-sm">タブごとに入力と結果を別々に保持します。左でURLやテキストを入力して「抽出スタート」</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {view === "setlist" && (
          <SetlistView setlists={setlists} setSetlists={setSetlists} activeId={setlistId} setActiveId={setSetlistId} performedKeys={performedKeys} performedText={performedText} setPerformedText={setPerformedText} onOpenPerformed={() => setPerformedOpen(true)} />
        )}

        {view === "playlist" && <div className="mx-auto max-w-3xl"><PlaylistTool lastSongs={result?.songs ?? []} /></div>}

        {view === "history" && (
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">抽出履歴（最新20件・この端末のみ）</h2>
              {history.length > 0 && <button onClick={() => setHistory([])} className={cx(btn.base, btn.text, "text-rose-700 dark:text-rose-300")}>すべて削除</button>}
            </div>
            {history.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400">まだ履歴はありません</p>}
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{h.presetName}<span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-400">{h.count}曲</span></p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{new Date(h.at).toLocaleString("ja-JP")}</p>
                </div>
                <button onClick={() => { setResults((r) => ({ ...r, [active.id]: { historyId: h.id, songs: h.songs, warnings: [], name: h.presetName } })); setView("extract"); toast(`「${active.name}」タブで開きました`, "info"); }} className={cx(btn.base, btn.filled, "min-h-10")}>開く</button>
                <button onClick={() => setHistory((x) => x.filter((y) => y.id !== h.id))} className={btn.icon} aria-label={`${h.presetName}の履歴を削除`}><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* スマホ: 下部固定バー（親指で届く位置に主要操作） */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 md:hidden print:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        {view === "extract" && <div className="mb-2">{startButton}</div>}
        <nav className="grid grid-cols-4 gap-1" aria-label="メイン">
          {NAV_ITEMS.map(([v, label, Icon]) => (
            <button key={v} onClick={() => changeView(v)} aria-current={view === v ? "page" : undefined} className={cx("flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold", view === v ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-400")}>
              <span className={cx("grid h-7 w-14 place-items-center rounded-full transition", view === v && "bg-indigo-100 dark:bg-indigo-500/20")}><Icon className="h-5 w-5" /></span>{label}
            </button>
          ))}
        </nav>
      </div>

      <PerformedModal open={performedOpen} onClose={() => setPerformedOpen(false)} text={performedText} setText={setPerformedText} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tab={settingsTab}
        setTab={setSettingsTab}
        keys={keys}
        setKeys={setKeys}
        prefs={prefs}
        setPrefs={setPrefs}
        health={health}
        onBackup={backup}
        onRestore={restore}
        onSignIn={login}
        onSignOut={logout}
      />

      <Confirm
        open={!!confirm}
        title={confirm?.kind === "delete" ? "このタブを閉じますか？" : "プリセットを初期化しますか？"}
        body={confirm?.kind === "delete" ? "タブの入力内容と設定が削除されます。閉じた直後は「元に戻す」で復元できます。" : "このタブの入力内容と設定がすべて初期状態に戻ります。"}
        okLabel={confirm?.kind === "delete" ? "閉じる" : "初期化する"}
        danger={confirm?.kind === "delete"}
        onCancel={() => setConfirm(null)}
        onOk={(dontAsk) => {
          if (!confirm) return;
          if (confirm.kind === "delete") { closeTab(confirm.id); if (dontAsk) setPrefs({ ...prefs, confirmDelete: false }); }
          else { doReset(confirm.id); if (dontAsk) setPrefs({ ...prefs, confirmReset: false }); }
          setConfirm(null);
        }}
      />
    </div>
  );
}
