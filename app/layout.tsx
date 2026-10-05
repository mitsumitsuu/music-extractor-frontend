import type { Metadata, Viewport } from "next";
import { BIZ_UDPGothic } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const ud = BIZ_UDPGothic({ weight: ["400", "700"], subsets: ["latin"], display: "swap", variable: "--font-ud", preload: false });

export const metadata: Metadata = {
  title: "楽曲抽出システム",
  description: "YouTube・ランキング・PDF/画像からボカロ曲を抽出し、プレイリストやExcelに書き出すツール",
  applicationName: "楽曲抽出システム",
  appleWebApp: { capable: true, title: "楽曲抽出", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f1f5f9",
};

// 初回描画前にダークモードを適用（画面のチラつき防止）
const themeScript = `try{var p=JSON.parse(localStorage.getItem('mx:prefs:v2')||'{}');var t=p.theme||'system';if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts が発行した CSP 用 nonce（これが無いインラインスクリプトはブラウザが実行しない）
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="ja" suppressHydrationWarning className={`${ud.variable} antialiased`}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
