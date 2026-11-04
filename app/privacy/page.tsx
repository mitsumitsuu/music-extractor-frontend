import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "プライバシーポリシー | 楽曲抽出システム" };

// Google ログイン（OAuth）の公開に必要なプライバシーポリシー。実装（auth.ts・lib/storage.ts・app/api/*）と内容を一致させること。
const sections: { h: string; items: string[] }[] = [
  {
    h: "1. 取得する情報",
    items: [
      "Google ログイン時に、Google アカウントのメールアドレスと表示名のみを受け取ります（プロフィール画像・連絡先・Google ドライブ等にはアクセスしません）。",
      "抽出のために入力された URL・テキスト・ファイル、お問い合わせの内容（件名・本文・返信先・添付ファイル）。",
    ],
  },
  {
    h: "2. 保存場所と期間",
    items: [
      "ログイン状態は、暗号化した Cookie（最長 7 日）にメールアドレスと表示名だけを保存します。運営側のデータベースはありません。",
      "プリセット・履歴・セトリなどの設定は、利用者の端末（ブラウザ）にのみ保存されます。API キーと合言葉は、「この端末に保存する」をオンにした場合のみ端末に残ります。",
      "抽出の入力内容はサーバーに保存せず、処理が終わると破棄します。",
    ],
  },
  {
    h: "3. 外部サービスへの送信",
    items: [
      "AI 抽出を使う場合、入力内容を Google（Gemini）または OpenAI の API に送信します。",
      "YouTube の情報取得のため、YouTube（Google）に曲名や動画 ID を送信します。",
      "お問い合わせは FormSubmit を経由して運営者のメールに転送されます。",
      "ホスティングには Vercel を利用しています。",
    ],
  },
  {
    h: "4. 利用目的",
    items: ["本サービスの提供（ログイン・楽曲情報の抽出・お問い合わせへの返信）のためだけに使い、広告や第三者への販売には使いません。"],
  },
  {
    h: "5. 削除・お問い合わせ",
    items: [
      "端末に保存されたデータは、ブラウザの「サイトデータの削除」でいつでも消せます（履歴は「履歴」画面からも削除できます）。ログアウトするとログイン用の Cookie は削除されます。",
      "Google アカウントとの連携は、Google アカウントの「サードパーティ製のアプリとサービス」から解除できます。",
      "ご質問はアプリ内の「設定 → お問い合わせ」からご連絡ください。",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">楽曲抽出システム（以下「本サービス」）における個人情報の取り扱いについて定めます。制定日: 2026年11月4日</p>
      {sections.map((s) => (
        <section key={s.h} className="mt-8">
          <h2 className="text-lg font-bold">{s.h}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {s.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      ))}
      <Link href="/" className="mt-10 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">
        トップへ戻る
      </Link>
    </main>
  );
}
