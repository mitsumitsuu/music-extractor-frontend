import type { MetadataRoute } from "next";

// スマホの「ホーム画面に追加」でアプリのように起動できるようにする（PWA）
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "楽曲抽出システム",
    short_name: "楽曲抽出",
    description: "ボカロ曲の抽出・プレイリスト作成ツール",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#4f46e5",
    lang: "ja",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
