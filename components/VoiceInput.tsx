"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SpeechInputSession, getSpeechRecognitionConstructor, type SpeechInputState } from "@/lib/speech-input";
import { cx } from "./ui";

export function VoiceInput({ onAppend, onEnableText, onActiveChange, disabled }: {
  onAppend: (text: string) => void;
  onEnableText: () => void;
  onActiveChange: (active: boolean) => void;
  disabled: boolean;
}) {
  const [supported] = useState(() => !!getSpeechRecognitionConstructor());
  const [state, setState] = useState<SpeechInputState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [hasText, setHasText] = useState(false);
  const sessionRef = useRef<SpeechInputSession | null>(null);
  const callbacksRef = useRef({ onAppend, onActiveChange });
  useEffect(() => { callbacksRef.current = { onAppend, onActiveChange }; }, [onAppend, onActiveChange]);

  useEffect(() => {
    const session = new SpeechInputSession(() => {
      const Constructor = getSpeechRecognitionConstructor();
      return Constructor ? new Constructor() : undefined;
    }, {
      onState: (next) => {
        setState(next);
        callbacksRef.current.onActiveChange(next !== "idle");
      },
      onFinalText: (text) => {
        callbacksRef.current.onAppend(text);
        setHasText(true);
      },
      onInterimText: setInterim,
      onError: setError,
    });
    sessionRef.current = session;
    const onVisibility = () => { if (document.hidden) session.stop(); };
    const onPageHide = () => session.stop();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      session.dispose();
      sessionRef.current = null;
      callbacksRef.current.onActiveChange(false);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  const active = state !== "idle";
  const toggle = () => {
    if (active) { sessionRef.current?.stop(); return; }
    if (!supported || !window.isSecureContext) {
      setError(!supported ? "このブラウザは音声入力に対応していません。キーボードの音声入力を利用できます。" : "音声入力にはHTTPS接続が必要です。");
      return;
    }
    setError("");
    setHasText(false);
    onEnableText();
    sessionRef.current?.start();
  };

  return (
    <>
      <button type="button" onClick={toggle} disabled={disabled || state === "stopping"}
        title={supported ? "日本語の音声入力" : "このブラウザは音声入力に対応していません"}
        aria-label={active ? "音声入力を停止" : "音声入力を開始"} aria-pressed={active}
        className={cx("flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition disabled:opacity-50", active ? "border-rose-700 bg-rose-700 text-white" : "border-slate-400 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200")}>
        {active ? <Square className="h-4 w-4 fill-current" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
        {state === "stopping" ? "停止中…" : active ? "音声入力を停止" : "音声入力"}
      </button>
      {(active || interim || error || hasText) && (
        <div className="w-full min-w-0 space-y-1 text-sm">
          {error ? <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p> : (
            <p role="status" className="font-bold text-indigo-700 dark:text-indigo-300">
              {state === "starting" ? "マイク接続中…" : state === "listening" ? "音声を入力中" : state === "stopping" ? "認識結果を確定中…" : "テキストに追記しました"}
            </p>
          )}
          {interim && <p className="break-words text-slate-600 dark:text-slate-300" aria-label="認識中のテキスト">{interim}</p>}
        </div>
      )}
    </>
  );
}
