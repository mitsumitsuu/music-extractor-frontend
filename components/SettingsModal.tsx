"use client";

import { CheckCircle2, Download, KeyRound, Mail, Paperclip, Settings, Upload } from "lucide-react";
import { useState } from "react";
import { exportJSON } from "@/lib/exporters";
import { sanitizePreset, type Prefs } from "@/lib/storage";
import type { ApiKeys, HealthResponse, Preset } from "@/lib/types";
import { Field, Modal, Switch, cx, inputCls, useToast } from "./ui";

type Tab = "keys" | "general" | "data" | "contact";

export function SettingsModal({
  open, onClose, keys, setKeys, prefs, setPrefs, health, presets, importPresets,
}: {
  open: boolean; onClose: () => void;
  keys: ApiKeys; setKeys: (k: ApiKeys) => void;
  prefs: Prefs; setPrefs: (p: Prefs) => void;
  health: HealthResponse | null;
  presets: Preset[]; importPresets: (p: Preset[]) => void;
}) {
  const [tab, setTab] = useState<Tab>("keys");
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!message.trim()) { toast("内容を入力してください", "err"); return; }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("subject", subject);
      fd.append("message", message);
      fd.append("reply", reply);
      files.forEach((f, i) => fd.append(`attachment_${i}`, f));
      const res = await fetch("/api/contact", { method: "POST", body: fd, headers: prefs.passcode ? { "x-app-passcode": prefs.passcode } : undefined });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "送信に失敗しました");
      toast("送信しました。ありがとうございます！");
      setSubject(""); setMessage(""); setFiles([]);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSending(false);
    }
  };

  const keyRow = (k: keyof ApiKeys, label: string, server: boolean | undefined, help: string, link: string) => (
    <Field label={label} hint={server ? "✅ サーバーに設定済みのため入力不要です（入力すると自分のキーを優先）" : help}>
      {(id) => (
        <div className="flex gap-2">
          <input id={id} type="password" autoComplete="off" className={inputCls} placeholder={server ? "（サーバー設定を使用）" : "未設定"} value={keys[k] ?? ""} onChange={(e) => setKeys({ ...keys, [k]: e.target.value.trim() })} />
          <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 self-center whitespace-nowrap text-xs font-bold text-indigo-600 hover:underline">取得方法</a>
        </div>
      )}
    </Field>
  );

  const tabs: { id: Tab; label: string; icon: typeof Settings }[] = [
    { id: "keys", label: "APIキー", icon: KeyRound },
    { id: "general", label: "一般", icon: Settings },
    { id: "data", label: "データ", icon: Download },
    { id: "contact", label: "お問い合わせ", icon: Mail },
  ];

  return (
    <Modal open={open} onClose={onClose} title="設定" wide>
      <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 scrollbar-hide" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cx("flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold", tab === t.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300")}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === "keys" && (
        <div className="space-y-4">
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            キーはこの端末からサーバーへ送信時のみ使われ、共有リンクには含まれません。管理者が Vercel の環境変数に設定すれば、利用者はキー入力なしで使えます。
          </p>
          {keyRow("gemini", "Gemini API キー（AI抽出・おすすめ）", health?.gemini, "無料枠あり。PDF・画像の解析に強い。", "https://aistudio.google.com/apikey")}
          {keyRow("openai", "OpenAI（ChatGPT）API キー", health?.openai, "Geminiの代わり／予備として使えます。", "https://platform.openai.com/api-keys")}
          {keyRow("youtube", "YouTube Data API キー", health?.youtube, "プレイリスト展開・再生数/コメント数の取得に使用。", "https://console.cloud.google.com/apis/library/youtube.googleapis.com")}
          <Switch checked={prefs.rememberKeys} onChange={(v) => setPrefs({ ...prefs, rememberKeys: v })} label="この端末にキーを保存する" desc="共用PCではオフにしてください（オフ＝タブを閉じると消去）" />
          {health?.passcodeRequired && (
            <Field label="合言葉" hint="管理者から共有された合言葉を入力してください。">
              {(id) => <input id={id} type="password" className={inputCls} value={prefs.passcode} onChange={(e) => setPrefs({ ...prefs, passcode: e.target.value })} />}
            </Field>
          )}
        </div>
      )}

      {tab === "general" && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-bold">テーマ</p>
            <div className="grid grid-cols-3 gap-2">
              {(["system", "light", "dark"] as const).map((t) => (
                <button key={t} onClick={() => setPrefs({ ...prefs, theme: t })} className={cx("rounded-xl border-2 py-2.5 text-sm font-bold", prefs.theme === t ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-500/15" : "border-slate-200 dark:border-slate-700")}>
                  {t === "system" ? "自動" : t === "light" ? "ライト" : "ダーク"}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <Switch checked={prefs.confirmDelete} onChange={(v) => setPrefs({ ...prefs, confirmDelete: v })} label="プリセット削除時に確認する" />
            <Switch checked={prefs.confirmReset} onChange={(v) => setPrefs({ ...prefs, confirmReset: v })} label="プリセット初期化時に確認する" />
          </div>
        </div>
      )}

      {tab === "data" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">プリセットはこの端末（ブラウザ）に自動保存されます。別の端末へ移すときはバックアップを使ってください。</p>
          <button onClick={() => exportJSON({ version: 2, presets }, "music-extractor-backup.json")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700">
            <Download className="h-4 w-4" />バックアップを保存（APIキーは含みません）
          </button>
          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-indigo-600 py-3 font-bold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-200 dark:hover:bg-indigo-500/10">
            <Upload className="h-4 w-4" />バックアップから復元
            <input type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const j = JSON.parse(await f.text()) as { presets?: unknown[] };
                const list = (j.presets ?? []).map((p) => sanitizePreset(p as Partial<Preset> & Record<string, unknown>));
                if (!list.length) throw new Error();
                importPresets(list);
                toast(`${list.length}件のプリセットを追加しました`);
              } catch {
                toast("バックアップファイルを読み込めませんでした", "err");
              }
            }} />
          </label>
        </div>
      )}

      {tab === "contact" && (
        <div className="space-y-4">
          <Field label="件名">{(id) => <input id={id} className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />}</Field>
          <Field label="内容">{(id) => <textarea id={id} rows={5} className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} />}</Field>
          <Field label="返信先メール（任意）">{(id) => <input id={id} type="email" className={inputCls} value={reply} onChange={(e) => setReply(e.target.value)} />}</Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-indigo-600">
            <Paperclip className="h-4 w-4" />スクリーンショット等を添付（合計4MBまで）
            <input type="file" multiple accept="image/*,video/*" className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
          {files.length > 0 && <p className="text-xs text-slate-500">{files.map((f) => f.name).join(", ")}</p>}
          <button disabled={sending} onClick={send} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
            <CheckCircle2 className="h-4 w-4" />{sending ? "送信中…" : "管理者に送信"}
          </button>
        </div>
      )}
    </Modal>
  );
}
