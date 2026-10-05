"use client";

import { CheckCircle2, Download, KeyRound, LogIn, LogOut, Mail, Paperclip, Settings, Upload, UserRound } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import type { Prefs } from "@/lib/storage";
import type { ApiKeys, HealthResponse } from "@/lib/types";
import { Field, Modal, Switch, btn, cx, inputCls, useToast } from "./ui";

export type SettingsTab = "keys" | "general" | "data" | "contact";

const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: "keys", label: "APIキー", icon: KeyRound },
  { id: "general", label: "一般", icon: Settings },
  { id: "data", label: "データ", icon: Download },
  { id: "contact", label: "お問い合わせ", icon: Mail },
];

export function SettingsModal({
  open, onClose, tab, setTab, keys, setKeys, prefs, setPrefs, health, onBackup, onRestore, onSignIn, onSignOut,
}: {
  open: boolean; onClose: () => void;
  tab: SettingsTab; setTab: (t: SettingsTab) => void;
  keys: ApiKeys; setKeys: (k: ApiKeys) => void;
  prefs: Prefs; setPrefs: (p: Prefs) => void;
  health: HealthResponse | null;
  onBackup: () => void;
  /** 復元結果のメッセージを返す（失敗時は例外） */
  onRestore: (file: File) => Promise<string>;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const auth = health?.auth;

  const send = async () => {
    if (!message.trim()) { toast("内容を入力してください", "err"); return; }
    if (auth?.required && !auth.user) { toast("お問い合わせにはログインが必要です", "err"); return; }
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

  // WAI-ARIA のタブ操作（← → Home End）
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const n = TABS.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const keyRow = (k: keyof ApiKeys, label: string, server: boolean | undefined, help: string, link: string) => (
    <Field label={label} hint={server ? "サーバーに設定済みのため入力は不要です（入力すると自分のキーを優先します）" : help}>
      {(id) => (
        <div className="flex items-center gap-2">
          <input id={id} type="password" autoComplete="off" spellCheck={false} className={inputCls} placeholder={server ? "（サーバー設定を使用）" : "未設定"} value={keys[k] ?? ""} onChange={(e) => setKeys({ ...keys, [k]: e.target.value.trim() })} />
          <a href={link} target="_blank" rel="noopener noreferrer" className={cx(btn.base, btn.text, "shrink-0 px-3 text-indigo-700 dark:text-indigo-300")}>取得方法</a>
        </div>
      )}
    </Field>
  );

  const toolbar = (
    <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="設定の項目">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { tabRefs.current[i] = el; }}
          id={`settings-tab-${t.id}`}
          role="tab"
          aria-selected={tab === t.id}
          aria-controls="settings-panel"
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => setTab(t.id)}
          onKeyDown={(e) => onTabKey(e, i)}
          className={cx(
            "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-bold transition sm:flex-row sm:gap-1.5 sm:text-sm",
            tab === t.id ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-950 dark:text-indigo-200" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
          )}
        >
          <t.icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{t.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="設定" size="lg" fixed toolbar={toolbar}>
      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
        {tab === "keys" && (
          <div className="space-y-5">
            <p className="rounded-xl bg-slate-100 px-3 py-2.5 text-xs leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              キーは抽出のときだけこの端末からサーバーへ送られ、共有リンクやバックアップには含まれません。管理者がサーバーに設定し利用を許可したアカウントは、キー入力なしで使えます。
            </p>
            {keyRow("gemini", "Gemini API キー（AI抽出・おすすめ）", health?.gemini, "無料枠あり。PDF・画像の解析に強い。", "https://aistudio.google.com/apikey")}
            {keyRow("openai", "OpenAI（ChatGPT）API キー", health?.openai, "Geminiの代わり／予備として使えます。", "https://platform.openai.com/api-keys")}
            {keyRow("youtube", "YouTube Data API キー", health?.youtube, "プレイリスト展開・再生数/コメント数の取得に使用。", "https://console.cloud.google.com/apis/library/youtube.googleapis.com")}
            <Switch checked={prefs.rememberKeys} onChange={(v) => setPrefs({ ...prefs, rememberKeys: v })} label="この端末にキーを保存する" desc="共用PCではオフにしてください（オフ＝タブを閉じると消去）" />
            {health?.passcodeRequired && (
              <Field label="合言葉" hint="管理者から共有された合言葉を入力してください。">
                {(id) => <input id={id} type="password" autoComplete="off" className={inputCls} value={prefs.passcode} onChange={(e) => setPrefs({ ...prefs, passcode: e.target.value })} />}
              </Field>
            )}
          </div>
        )}

        {tab === "general" && (
          <div className="space-y-6">
            <section aria-labelledby="account-h">
              <h3 id="account-h" className="mb-2 text-sm font-bold">アカウント</h3>
              {!auth?.enabled ? (
                <p className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">ログイン機能は管理者が設定すると使えるようになります。</p>
              ) : auth.user ? (
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100"><UserRound className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{auth.user.name}</span>
                    <span className="block truncate text-xs text-slate-600 dark:text-slate-400">{auth.user.email}</span>
                  </span>
                  <button onClick={onSignOut} className={cx(btn.base, btn.outlined, "shrink-0")}><LogOut className="h-4 w-4" />ログアウト</button>
                </div>
              ) : (
                <button onClick={onSignIn} className={cx(btn.base, btn.filled, "w-full")}><LogIn className="h-4 w-4" />Googleでログイン</button>
              )}
            </section>
            <section aria-labelledby="theme-h">
              <h3 id="theme-h" className="mb-2 text-sm font-bold">テーマ</h3>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="theme-h">
                {(["system", "light", "dark"] as const).map((t) => (
                  <button key={t} role="radio" aria-checked={prefs.theme === t} onClick={() => setPrefs({ ...prefs, theme: t })} className={cx("min-h-11 rounded-xl border-2 text-sm font-bold", prefs.theme === t ? "border-indigo-600 bg-indigo-50 text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-50" : "border-slate-200 hover:border-slate-400 dark:border-slate-700")}>
                    {t === "system" ? "自動" : t === "light" ? "ライト" : "ダーク"}
                  </button>
                ))}
              </div>
            </section>
            <section aria-labelledby="confirm-h">
              <h3 id="confirm-h" className="mb-1 text-sm font-bold">確認</h3>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                <Switch checked={prefs.confirmDelete} onChange={(v) => setPrefs({ ...prefs, confirmDelete: v })} label="タブ（プリセット）を閉じる前に確認する" desc="オフでも閉じた直後は「元に戻す」で復元できます" />
                <Switch checked={prefs.confirmReset} onChange={(v) => setPrefs({ ...prefs, confirmReset: v })} label="プリセット初期化時に確認する" />
              </div>
            </section>
          </div>
        )}

        {tab === "data" && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">プリセット・セトリ・演奏済みリストはこの端末（ブラウザ）に自動保存されます。別の端末へ移すときはバックアップを使ってください。</p>
            <button onClick={onBackup} className={cx(btn.base, btn.filled, "w-full min-h-12")}>
              <Download className="h-4 w-4" />バックアップを保存（APIキーは含みません）
            </button>
            <label className={cx(btn.base, btn.outlined, "w-full min-h-12 cursor-pointer border-2 border-indigo-600 text-indigo-700 focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-indigo-700 dark:border-indigo-400 dark:text-indigo-200")}>
              <Upload className="h-4 w-4" />バックアップから復元
              <input type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try { toast(await onRestore(f)); } catch { toast("バックアップファイルを読み込めませんでした", "err"); }
              }} />
            </label>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">復元すると、今のデータに追加されます（同じセトリは新しい方で更新）。</p>
          </div>
        )}

        {tab === "contact" && (
          <div className="space-y-4">
            {auth?.required && !auth.user && (
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">お問い合わせの送信にはログインが必要です。</p>
            )}
            <Field label="件名">{(id) => <input id={id} className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />}</Field>
            <Field label="内容（必須）">{(id) => <textarea id={id} rows={5} className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} required />}</Field>
            <Field label="返信先メール（任意）">{(id) => <input id={id} type="email" autoComplete="email" className={inputCls} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={200} />}</Field>
            <label className={cx(btn.base, btn.text, "cursor-pointer justify-start px-2 text-indigo-700 focus-within:outline focus-within:outline-3 focus-within:outline-indigo-700 dark:text-indigo-300")}>
              <Paperclip className="h-4 w-4" />スクリーンショット等を添付（5個・合計4MBまで）
              <input type="file" multiple accept="image/*,video/*" className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
            </label>
            {files.length > 0 && <p className="text-xs text-slate-600 dark:text-slate-400">{files.map((f) => f.name).join(", ")}</p>}
            <button disabled={sending} onClick={send} className={cx(btn.base, btn.filled, "w-full min-h-12")}>
              <CheckCircle2 className="h-4 w-4" />{sending ? "送信中…" : "管理者に送信"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
