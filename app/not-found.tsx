import Link from "next/link";

// 自前の 404 ページ。Next.js 標準の 404 はノンスの付かないインライン <style> を含み、厳格な CSP で崩れるため置き換える。
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-100 px-4 text-center text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <p className="text-5xl font-bold text-indigo-700 dark:text-indigo-300">404</p>
      <h1 className="text-xl font-bold">ページが見つかりません</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">URL が間違っているか、ページが移動した可能性があります。</p>
      <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">
        トップへ戻る
      </Link>
    </main>
  );
}
