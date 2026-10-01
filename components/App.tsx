"use client";

import { Reorder } from "framer-motion";
import { Copy, History, ListMusic, Loader2, Moon, Music2, Pencil, Play, Plus, RefreshCw, Settings, Share2, Sparkles, Sun, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPreset, decodeSharedPreset, encodePresetForShare, newId, store, type HistoryEntry, type Prefs } from "@/lib/storage";
import type { ApiKeys, ExtractResponse, HealthResponse, Preset, Song, UploadFile } from "@/lib/types";
import { ExtractForm } from "./ExtractForm";
import { PlaylistTool } from "./PlaylistTool";
import { Results } from "./Results";
import { SettingsModal } from "./SettingsModal";
import { Confirm, ToastProvider, cx, useToast } from "./ui";

const MAX_PRESETS = 10;
type View = "extract" | "playlist" | "history";

function loadKeys(remember: boolean): ApiKeys {
  if (remember) return store.loadKeys();
  try {
    return JSON.parse(window.sessionStorage.getItem("mx:keys:session") ?? "{}") as ApiKeys;
  } catch {
    return {};
  }
}

/** 共有リンク（?preset=...）があれば読み込む */
function initialPresets(): { presets: Preset[]; active: string; shared: boolean } {
  const presets = store.loadPresets();
  let active = store.loadActive();
  let shared = false;
  try {
    const param = new URLSearchParams(window.location.search).get("preset");
    const p = param ? decodeSharedPreset(param) : null;
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
  const [prefs, setPrefsState] = useState<Prefs>(() => store.loadPrefs());
  const [keys, setKeysState] = useState<ApiKeys>(() => loadKeys(store.loadPrefs().rememberKeys));
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [filesBy, setFilesBy] = useState<Record<string, UploadFile[]>>({});
  const [view, setView] = useState<View>("extract");
  const [history, setHistory] = useState<HistoryEntry[]>(() => store.loadHistory());
  const [result, setResult] = useState<{ historyId: string; songs: Song[]; warnings: string[]; meta?: ExtractResponse["meta"]; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "delete" | "reset"; id: string }>(null);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [finePointer] = useState(() => window.matchMedia("(pointer: fine)").matches);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const active = presets.find((p) => p.id === activeId) ?? presets[0];
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark);

  /* ---- 永続化・副作用 ---- */
  useEffect(() => store.savePresets(presets), [presets]);
  useEffect(() => store.saveActive(activeId), [activeId]);
  useEffect(() => store.savePrefs(prefs), [prefs]);
  useEffect(() => store.saveHistory(history), [history]);
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
    fetch("/api/health")
      .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : null))
      .then((h) => { if (alive) setHealth(h); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!init.shared) return;
    toast("共有されたプリセットを追加しました", "info");
    const url = new URL(window.location.href);
    url.searchParams.delete("preset");
    window.history.replaceState(null, "", url.toString());
  }, [init.shared, toast]);
  useEffect(() => {
    if (!loading) return;
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => { clearInterval(iv); setElapsed(0); };
  }, [loading]);

  const setPrefs = (p: Prefs) => setPrefsState(p);
  const update = useCallback((u: Partial<Preset>) => setPresets((ps) => ps.map((p) => (p.id === activeId ? { ...p, ...u } : p))), [activeId]);

  /* ---- プリセット操作 ---- */
  const addPreset = () => {
    if (presets.length >= MAX_PRESETS) { toast(`プリセットは最大${MAX_PRESETS}個です`, "err"); return; }
    const p = createPreset(`プリセット ${presets.length + 1}`);
    setPresets((ps) => [...ps, p]);
    setActiveId(p.id);
  };
  const duplicate = () => {
    if (presets.length >= MAX_PRESETS) { toast(`プリセットは最大${MAX_PRESETS}個です`, "err"); return; }
    const p = { ...structuredClone(active), id: newId(), name: `${active.name} のコピー`.slice(0, 40) };
    setPresets((ps) => [...ps, p]);
    setActiveId(p.id);
    toast("複製しました");
  };
  const doDelete = (id: string) => {
    if (presets.length <= 1) { toast("プリセットは最低1つ必要です", "err"); return; }
    const idx = presets.findIndex((p) => p.id === id);
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    if (activeId === id) setActiveId(next[Math.max(0, idx - 1)].id);
  };
  const doReset = (id: string) => {
    setPresets((ps) => ps.map((p) => (p.id === id ? { ...createPreset(p.name), id: p.id } : p)));
    setFilesBy((f) => ({ ...f, [id]: [] }));
  };
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?preset=${encodePresetForShare(active)}`;
    try {
      if (navigator.share && !finePointer) await navigator.share({ title: `楽曲抽出プリセット「${active.name}」`, url });
      else { await navigator.clipboard.writeText(url); toast("共有リンクをコピーしました（APIキーは含まれません）"); }
    } catch { /* キャンセル */ }
  };

  /* ---- 抽出 ---- */
  const files = filesBy[active.id] ?? [];
  const canStart = (active.useUrl && active.url.trim()) || (active.usePaste && active.pastedText.trim()) || (active.useFile && files.length > 0);

  const start = async () => {
    if (loading) return;
    if (!canStart) { setError("URL・テキスト・ファイルのいずれかを入力してください。"); return; }
    setError("");
    setLoading(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        signal: ac.signal,
        headers: { "Content-Type": "application/json", ...(prefs.passcode ? { "x-app-passcode": prefs.passcode } : {}) },
        body: JSON.stringify({
          urls: active.useUrl ? active.url.split(/\s+/).filter(Boolean) : [],
          text: active.usePaste ? active.pastedText : "",
          files: active.useFile ? files : [],
          mode: active.mode,
          provider: active.provider,
          filters: active.filters,
          links: active.links,
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
      const historyId = newId();
      setResult({ historyId, songs: data.songs, warnings: data.warnings, meta: data.meta, name: active.filename || active.name });
      if (data.songs.length) {
        setHistory((h) => [{ id: historyId, at: Date.now(), presetName: active.name, count: data.songs.length, songs: data.songs }, ...h].slice(0, 20));
        toast(`${data.songs.length}曲を抽出しました`);
      } else toast("曲が見つかりませんでした", "info");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      if ((e as Error).name === "AbortError") setError("抽出を中止しました。");
      else setError((e as Error).message || "通信エラーが発生しました。");
    } finally {
      setLoading(false);
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

  const hasUserKey = useMemo(() => ({ youtube: !!keys.youtube, ai: !!(keys.gemini || keys.openai) }), [keys]);

  const updateResultSongs = (songs: Song[]) => {
    if (!result) return;
    setResult({ ...result, songs });
    setHistory((entries) => entries.map((entry) => entry.id === result.historyId ? { ...entry, songs, count: songs.length } : entry));
  };

  const startButton = (
    loading ? (
      <button onClick={() => abortRef.current?.abort()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-4 text-lg font-bold text-white shadow-lg transition active:scale-[.98] hover:bg-rose-700">
        <Loader2 className="h-5 w-5 animate-spin" />抽出中… {elapsed}秒（タップで中止）
      </button>
    ) : (
      <button onClick={start} className={cx("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-lg transition active:scale-[.98]", canStart ? "bg-indigo-600 hover:bg-indigo-700" : "bg-slate-400 dark:bg-slate-700")}>
        {active.mode === "ai" ? <Sparkles className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}抽出スタート
        <kbd className="ml-2 hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-normal lg:inline">Ctrl+Enter</kbd>
      </button>
    )
  );

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 dark:bg-[#0b1120] dark:text-slate-100">
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-slate-100/85 backdrop-blur-md dark:border-slate-800 dark:bg-[#0b1120]/85 print:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-600 text-white shadow"><Music2 className="h-5 w-5" /></div>
          <h1 className="text-lg font-bold tracking-wide sm:text-xl">楽曲抽出システム</h1>
          <nav className="ml-6 hidden gap-1 md:flex" aria-label="メイン">
            {([["extract", "抽出", Sparkles], ["playlist", "プレイリスト", ListMusic], ["history", "履歴", History]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setView(v)} className={cx("flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold", view === v ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-200" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200")}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setPrefs({ ...prefs, theme: dark ? "light" : "dark" })} className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="テーマ切替">
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button onClick={() => setSettingsOpen(true)} className="flex h-10 items-center gap-1.5 rounded-full px-3 hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="設定">
              <Settings className="h-5 w-5" /><span className="hidden text-sm font-bold sm:inline">設定</span>
              {!health?.gemini && !health?.openai && !keys.gemini && !keys.openai && <span className="h-2 w-2 rounded-full bg-amber-500" title="AIキー未設定" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-40 pt-4 sm:px-6 md:pb-16">
        {view === "extract" && (
          <>
            {/* プリセット */}
            <div className="mb-4 print:hidden">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide" ref={groupRef}>
                  <Reorder.Group as="div" axis="x" values={presets} onReorder={setPresets} className="flex w-max gap-2 py-1">
                    {presets.map((p) => (
                      <Reorder.Item key={p.id} value={p} as="div" dragListener={finePointer && renaming !== p.id}
                        className={cx("flex shrink-0 items-center rounded-full border text-sm font-bold transition", p.id === active.id ? "border-indigo-600 bg-indigo-600 text-white shadow" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300")}>
                        {renaming === p.id ? (
                          <input autoFocus defaultValue={p.name} maxLength={40} onPointerDown={(e) => e.stopPropagation()}
                            onBlur={(e) => { const v = e.target.value.trim(); if (v) setPresets((ps) => ps.map((x) => (x.id === p.id ? { ...x, name: v } : x))); setRenaming(null); }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }}
                            className="w-36 rounded-full bg-transparent px-4 py-2 outline-none" />
                        ) : (
                          <button onClick={() => setActiveId(p.id)} onDoubleClick={() => setRenaming(p.id)} className="max-w-[11rem] truncate px-4 py-2">{p.name}</button>
                        )}
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                </div>
                <button onClick={addPreset} disabled={presets.length >= MAX_PRESETS} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-slate-400 text-slate-500 hover:bg-white disabled:opacity-40 dark:hover:bg-slate-800" aria-label="プリセットを追加"><Plus className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {[
                  { label: "名前変更", icon: Pencil, on: () => setRenaming(active.id) },
                  { label: "複製", icon: Copy, on: duplicate },
                  { label: "共有", icon: Share2, on: share },
                  { label: "初期化", icon: RefreshCw, on: () => (prefs.confirmReset ? setConfirm({ kind: "reset", id: active.id }) : doReset(active.id)) },
                  { label: "削除", icon: Trash2, on: () => (prefs.confirmDelete ? setConfirm({ kind: "delete", id: active.id }) : doDelete(active.id)), danger: true },
                ].map((a) => (
                  <button key={a.label} onClick={a.on} className={cx("flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-bold hover:bg-white dark:hover:bg-slate-800", a.danger ? "text-rose-600" : "text-slate-600 dark:text-slate-300")}>
                    <a.icon className="h-3.5 w-3.5" />{a.label}
                  </button>
                ))}
                <span className="ml-auto hidden self-center text-slate-400 lg:inline">自動保存されます・ダブルクリックで名前変更・ドラッグで並べ替え</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
              <div className="min-w-0 lg:col-span-5 print:hidden">
                <ExtractForm preset={active} update={update} files={files} setFiles={(f) => setFilesBy((x) => ({ ...x, [active.id]: f }))} health={health} hasUserKey={hasUserKey} />
                {error && <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}
                <div className="mt-4 hidden md:block">{startButton}</div>
              </div>
              <div ref={resultsRef} className="min-w-0 scroll-mt-20 lg:col-span-7">
                {result ? (
                  <Results key={result.historyId} songs={result.songs} setSongs={updateResultSongs} name={result.name} meta={result.meta} warnings={result.warnings} dark={dark} />
                ) : (
                  <div className="hidden rounded-3xl border-2 border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700 lg:block">
                    <Music2 className="mx-auto mb-3 h-10 w-10 text-indigo-400" />
                    <p className="font-bold">ここに抽出結果が表示されます</p>
                    <p className="mt-1 text-sm">左でURLやテキストを入力して「抽出スタート」</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {view === "playlist" && <div className="mx-auto max-w-3xl"><PlaylistTool lastSongs={result?.songs ?? []} /></div>}

        {view === "history" && (
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">抽出履歴（最新20件・この端末のみ）</h2>
              {history.length > 0 && <button onClick={() => setHistory([])} className="text-sm font-bold text-rose-600">すべて削除</button>}
            </div>
            {history.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 dark:bg-slate-900">まだ履歴はありません</p>}
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{h.presetName}<span className="ml-2 text-sm font-normal text-slate-500">{h.count}曲</span></p>
                  <p className="text-xs text-slate-500">{new Date(h.at).toLocaleString("ja-JP")}</p>
                </div>
                <button onClick={() => { setResult({ historyId: h.id, songs: h.songs, warnings: [], name: h.presetName }); setView("extract"); }} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white">開く</button>
                <button onClick={() => setHistory((x) => x.filter((y) => y.id !== h.id))} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="履歴を削除"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* スマホ: 下部固定バー（親指で届く位置に主要操作） */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 md:hidden print:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {view === "extract" && <div className="mb-3">{startButton}</div>}
        <nav className="grid grid-cols-3 gap-1" aria-label="メイン">
          {([["extract", "抽出", Sparkles], ["playlist", "プレイリスト", ListMusic], ["history", "履歴", History]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v)} className={cx("flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold", view === v ? "text-indigo-600 dark:text-indigo-300" : "text-slate-500")}>
              <Icon className="h-5 w-5" />{label}
            </button>
          ))}
        </nav>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} keys={keys} setKeys={setKeysState} prefs={prefs} setPrefs={setPrefs} health={health} presets={presets}
        importPresets={(list) => setPresets((ps) => [...ps, ...list.map((p) => ({ ...p, id: newId() }))].slice(0, MAX_PRESETS))} />

      <Confirm
        open={!!confirm}
        title={confirm?.kind === "delete" ? "プリセットを削除しますか？" : "プリセットを初期化しますか？"}
        body={confirm?.kind === "delete" ? "この操作は元に戻せません。" : "このプリセットの入力内容と設定がすべて初期状態に戻ります。"}
        okLabel={confirm?.kind === "delete" ? "削除する" : "初期化する"}
        danger={confirm?.kind === "delete"}
        onCancel={() => setConfirm(null)}
        onOk={(dontAsk) => {
          if (!confirm) return;
          if (confirm.kind === "delete") { doDelete(confirm.id); if (dontAsk) setPrefs({ ...prefs, confirmDelete: false }); }
          else { doReset(confirm.id); if (dontAsk) setPrefs({ ...prefs, confirmReset: false }); }
          setConfirm(null);
        }}
      />
    </div>
  );
}
