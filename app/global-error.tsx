"use client";

// ルートレイアウトごと失敗したときの画面。Next.js 標準の画面はインライン <style> を含み CSP で崩れるため置き換える。
// エラーの詳細（メッセージ・スタック）は利用者に見せない。
import "./globals.css";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ja">
      <body>
        <title>エラー | 楽曲抽出システム</title>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-100 px-4 text-center text-slate-900">
          <h1 className="text-xl font-bold">問題が発生しました</h1>
          <p className="text-sm text-slate-600">時間をおいて、もう一度お試しください。</p>
          <button onClick={() => retry()} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">
            再読み込み
          </button>
        </main>
      </body>
    </html>
  );
}
