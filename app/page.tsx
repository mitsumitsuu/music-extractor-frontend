"use client";

import dynamic from "next/dynamic";

// 端末に保存した設定（localStorage）を使うため、ブラウザ側だけで描画する。
// サーバー描画との不一致（ハイドレーションエラー）を根本的に防ぐ。
const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-dvh place-items-center bg-slate-100 dark:bg-[#0b1120]">
      <div className="flex items-center gap-3 text-slate-500">
        <span className="h-3 w-3 animate-ping rounded-full bg-indigo-500" />
        <span className="font-bold">楽曲抽出システム</span>
      </div>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
