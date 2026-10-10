"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, ChevronDown, FileText, Link as LinkIcon, Sparkles, Upload, X, Zap } from "lucide-react";
import { useState } from "react";
import { toNumberOrEmpty } from "@/lib/parse";
import type { Filters, HealthResponse, Preset, UploadFile } from "@/lib/types";
import { Card, Field, Segmented, Switch, btn, cx, inputCls, useToast } from "./ui";
import { VoiceInput } from "./VoiceInput";

const MAX_TOTAL = 4 * 1024 * 1024;

/** PDF・画像を base64 に（FileReader はブラウザ内部で変換するので、自前で文字列連結するより速く省メモリ） */
const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

async function readFile(file: File): Promise<UploadFile> {
  const lower = file.name.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(lower)) {
    return { name: file.name, mime: file.type || "text/plain", text: await file.text(), size: file.size };
  }
  if (/\.(xlsx|xls|ods)$/.test(lower)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const text = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: "\t" })).join("\n");
    return { name: file.name, mime: "text/tab-separated-values", text, size: text.length };
  }
  const mime = file.type || (lower.endsWith(".pdf") ? "application/pdf" : "image/png");
  return { name: file.name, mime, data: await toBase64(file), size: file.size };
}

const StepBadge = ({ n }: { n: number }) => <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white" aria-hidden>{n}</span>;

export function ExtractForm({
  preset,
  update,
  files,
  setFiles,
  health,
  hasUserKey,
  appendSpeech,
  onSpeechActiveChange,
  busy,
}: {
  preset: Preset;
  update: (u: Partial<Preset>) => void;
  files: UploadFile[];
  setFiles: (f: UploadFile[]) => void;
  health: HealthResponse | null;
  hasUserKey: { youtube: boolean; ai: boolean };
  appendSpeech: (text: string) => void;
  onSpeechActiveChange: (active: boolean) => void;
  busy: boolean;
}) {
  const toast = useToast();
  // 3. 絞り込み・出力設定は最初から開いておく（折りたたみも可能）
  const [openFilter, setOpenFilter] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const f = preset.filters;
  const setF = (u: Partial<Filters>) => update({ filters: { ...f, ...u } });
  const aiReady = hasUserKey.ai || !!health?.gemini || !!health?.openai;
  const ytReady = hasUserKey.youtube || !!health?.youtube;
  const activeFilterCount = [f.minViews, f.maxViews, f.minComments, f.maxComments, f.excludeWords, f.vocal, f.producer, f.bpm, f.key, f.theme].filter((v) => v !== "" && v !== 0).length + (f.multiOnly ? 1 : 0) + (f.requireMmd ? 1 : 0);

  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    try {
      const read = await Promise.all(arr.map(readFile));
      const next = [...files, ...read].slice(0, 10);
      if (next.reduce((n, x) => n + x.size, 0) > MAX_TOTAL) {
        toast("ファイルの合計は4MBまでです", "err");
        return;
      }
      setFiles(next);
      update({ useFile: true });
    } catch {
      toast("ファイルを読み込めませんでした", "err");
    }
  };

  const numInput = (key: keyof Filters, label: string, placeholder?: string) => (
    <Field label={label}>
      {(id) => <input id={id} inputMode="numeric" className={inputCls} placeholder={placeholder} value={f[key] as number | ""} onChange={(e) => setF({ [key]: toNumberOrEmpty(e.target.value) } as Partial<Filters>)} />}
    </Field>
  );
  const textInput = (key: keyof Filters, label: string, placeholder?: string, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => <input id={id} className={inputCls} placeholder={placeholder} value={f[key] as string} onChange={(e) => setF({ [key]: e.target.value } as Partial<Filters>)} />}
    </Field>
  );

  return (
    <div className="space-y-4">
      {/* 1. 入力 */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <StepBadge n={1} />解析するデータ
          <span className="text-xs font-normal text-slate-600 dark:text-slate-400">（複数選択できます）</span>
        </h2>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="入力方法">
          {[
            { k: "useUrl" as const, icon: <LinkIcon className="h-4 w-4" />, label: "URL" },
            { k: "usePaste" as const, icon: <FileText className="h-4 w-4" />, label: "テキスト" },
            { k: "useFile" as const, icon: <Upload className="h-4 w-4" />, label: "ファイル" },
          ].map((o) => (
            <button
              key={o.k}
              type="button"
              aria-pressed={preset[o.k]}
              onClick={() => update({ [o.k]: !preset[o.k] })}
              className={cx(
                "flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition",
                preset[o.k] ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-400 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200",
              )}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
          <VoiceInput key={preset.id} onAppend={appendSpeech} onEnableText={() => update({ usePaste: true })} onActiveChange={onSpeechActiveChange} disabled={busy} />
        </div>

        <div className="space-y-4">
          {preset.useUrl && (
            <Field label="YouTube / SoundCloud / ランキングページのURL" hint="改行で複数入力できます。プレイリストURLもOK（YouTube APIキーがあると確実）。">
              {(id) => (
                <textarea id={id} rows={3} spellCheck={false} className={cx(inputCls, "font-mono text-sm")} placeholder={"https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/playlist?list=..."} value={preset.url} onChange={(e) => update({ url: e.target.value })} />
              )}
            </Field>
          )}
          {preset.usePaste && (
            <Field label="ランキング・曲リストのテキスト" hint="「1位 曲名 / P名 feat. 初音ミク」のような形式を自動で読み取ります。">
              {(id) => <textarea id={id} rows={6} className={inputCls} placeholder={"1位 ロキ / みきとP feat. 鏡音リン\n2位 千本桜 / 黒うさP feat. 初音ミク"} value={preset.pastedText} onChange={(e) => update({ pastedText: e.target.value })} />}
            </Field>
          )}
          {preset.useFile && (
            <div>
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files); }}
                className={cx(
                  "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-indigo-700",
                  dragOver ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10" : "border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800/50",
                )}
              >
                <Upload className="mb-2 h-8 w-8 text-indigo-600" aria-hidden />
                <span className="text-sm font-bold">タップして選択 / ドラッグ＆ドロップ</span>
                <span className="mt-1 text-xs text-slate-600 dark:text-slate-400">CSV・Excel・テキスト（キー不要）／ PDF・画像（AIキーが必要）・合計4MBまで</span>
                <input type="file" multiple className="sr-only" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,.pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((x, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg bg-slate-100 py-1 pl-3 pr-1 text-sm dark:bg-slate-800">
                      <span className="truncate">{x.name}<span className="ml-2 text-xs text-slate-600 dark:text-slate-400">{(x.size / 1024).toFixed(0)}KB{x.data && !aiReady ? "・AIキー必要" : ""}</span></span>
                      <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className={btn.icon} aria-label={`${x.name} を取り除く`}><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!preset.useUrl && !preset.usePaste && !preset.useFile && <p className="text-sm text-slate-600 dark:text-slate-400">上のボタンで入力方法を選んでください。</p>}
        </div>
      </Card>

      {/* 2. モード */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold"><StepBadge n={2} />抽出モード</h2>
        <Segmented
          label="抽出モード"
          value={preset.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { value: "fast", label: "高速", icon: <Zap className="h-4 w-4" />, desc: "キー不要。タイトルから自動判定" },
            { value: "ai", label: "AI抽出", icon: <Sparkles className="h-4 w-4" />, desc: aiReady ? "高精度。PDF・画像・Webページも" : "Gemini/OpenAIキーが必要" },
            { value: "stats", label: "統計", icon: <BarChart3 className="h-4 w-4" />, desc: ytReady ? "再生数・コメント数で絞り込み" : "YouTube APIキーが必要" },
          ]}
        />
        {preset.mode !== "fast" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="radiogroup" aria-label="AIエンジン">
            <span className="font-bold text-slate-700 dark:text-slate-300">AIエンジン:</span>
            {(["auto", "gemini", "openai"] as const).map((p) => (
              <button key={p} role="radio" aria-checked={preset.provider === p} onClick={() => update({ provider: p })} className={cx("min-h-10 rounded-full border px-3 font-bold", preset.provider === p ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800")}>
                {p === "auto" ? "おまかせ（推奨）" : p === "gemini" ? "Gemini" : "ChatGPT"}
              </button>
            ))}
          </div>
        )}
        {((preset.mode === "ai" && !aiReady) || (preset.mode === "stats" && !ytReady)) && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">このモードにはAPIキーが必要です。右上の「設定 → APIキー」から登録してください。</p>
        )}
      </Card>

      {/* 3. フィルター */}
      <Card className="!p-0">
        <h2>
          <button onClick={() => setOpenFilter(!openFilter)} className="flex min-h-14 w-full items-center justify-between rounded-3xl px-4 py-4 text-left sm:px-6" aria-expanded={openFilter} aria-controls="filter-panel">
            <span className="flex items-center gap-2 text-base font-bold">
              <StepBadge n={3} />絞り込み・出力設定
              {activeFilterCount > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100">{activeFilterCount}件 有効</span>}
            </span>
            <ChevronDown className={cx("h-5 w-5 transition", openFilter && "rotate-180")} aria-hidden />
          </button>
        </h2>
        <AnimatePresence initial={false}>
          {openFilter && (
            <motion.div id="filter-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-5 border-t border-slate-200 px-4 pb-6 pt-5 dark:border-slate-800 sm:px-6">
                <div className="grid grid-cols-2 gap-3">
                  {textInput("vocal", "ボカロ（合成音声）", "初音ミク, 鏡音リン")}
                  {textInput("producer", "ボカロP", "DECO*27")}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {numInput("bpm", "BPM（±3）", "120")}
                  {textInput("key", "Key", "Am / 8A")}
                  <div className="col-span-2 sm:col-span-1">{textInput("theme", "テーマ（AI）", "宇宙, 泣ける")}</div>
                </div>
                {textInput("excludeWords", "除外ワード", "カバー, 歌ってみた", "カンマ区切り。曲名・P名・歌唱者に含まれると除外します。")}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {numInput("minViews", "最小再生数")}
                  {numInput("maxViews", "最大再生数", "空=無制限")}
                  {numInput("minComments", "最小コメント")}
                  {numInput("maxComments", "最大コメント", "空=無制限")}
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  <Switch checked={f.multiOnly} onChange={(v) => setF({ multiOnly: v })} label="複数人歌唱の曲のみ" />
                  <Switch checked={f.requireMmd} onChange={(v) => setF({ requireMmd: v })} label="MMDがある曲のみ" desc="AIの知識で判定します（AIモード推奨）" />
                </div>
                <fieldset>
                  <legend className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">結果に付けるリンク</legend>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    <Switch checked={preset.links.lyrics} onChange={(v) => update({ links: { ...preset.links, lyrics: v } })} label="歌詞検索（Uta-Net）" />
                    <Switch checked={preset.links.analysis} onChange={(v) => update({ links: { ...preset.links, analysis: v } })} label="考察・大百科（初音ミクWiki）" />
                    <Switch checked={preset.links.tunebat} onChange={(v) => update({ links: { ...preset.links, tunebat: v } })} label="Tunebat（BPM/Key）" />
                  </div>
                </fieldset>
                <Field label="出力ファイル名">{(id) => <input id={id} className={inputCls} value={preset.filename} maxLength={60} onChange={(e) => update({ filename: e.target.value })} />}</Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
