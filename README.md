# 楽曲抽出システム v2

YouTube（動画・プレイリスト）/ SoundCloud / ランキングページ / テキスト / CSV・Excel / PDF・画像 から
ボカロ曲を抽出し、絞り込み・Excel/CSV/画像/PDF/M3U8/rekordbox XML への書き出し・YouTube連続再生プレイリスト作成ができる Web アプリです。

- フロント・API ともに Next.js（App Router）。**Vercel だけで完結**します（以前の `127.0.0.1:8000` の FastAPI は不要）。
- PC・スマホ両対応のレスポンシブ UI（スマホは下部に操作バー、ホーム画面に追加でアプリ化＝PWA）。
- プリセット・履歴・セトリ・設定はブラウザに自動保存。バックアップ(JSON)で端末間移行。

## タブ（プリセット）
- Chrome のようなタブで、入力内容・設定・抽出結果をタブごとに別々に保持します（最初は3つ、最大10個）。
- ＋で追加、×・Delete キー・ホイールクリックで閉じる（直後は「元に戻す」で復元）、ダブルクリック / F2 で名前変更、ドラッグで並べ替え、← → でタブ移動。
- 抽出中のタブにはくるくるが付き、別のタブに切り替えても結果は元のタブに入ります。

## モード
| モード | 必要なキー | 内容 |
|---|---|---|
| 高速 | なし | 動画タイトル・テキストを規則ベースで解析 |
| AI抽出 | Gemini または OpenAI | 資料全体（Webページ・PDF・画像含む）をAIが解析。BPM/Key/MMD/テーマ判定 |
| 統計 | YouTube Data API | 再生数・コメント数で絞り込み（URLの無い曲は先頭20曲まで自動検索） |

AIエンジンは「おまかせ」で Gemini を優先し、失敗時は ChatGPT に自動フォールバックします。

## 抽出後の編集・選択
- 結果の各曲にある「編集」で、曲名・ボカロP・合成音声・BPM・Key・MMD・動画URLを補正できます。
- 編集内容は履歴に自動保存され、Excel/CSV等の書き出しと連続再生にも反映されます。歌詞・Tunebat等の検索リンクも更新されます。
- 「表示中の曲を選択」でまとめて選択、「ランダムにN曲」で抽選、「統計」でボカロ別・P別の曲数やBPM分布を確認できます。
- 「演奏済みリスト」に過去の演奏曲を貼ると、結果にバッジが付き、隠すこともできます。

## セトリ
- 抽出結果から「セトリに追加」→ OP・MC・ED 等と並べて公演の進行表を作れます（合計時間・開始時刻・BPM/Key の流れ・重複/演奏済みの警告）。
- テキスト/TSV コピー、Excel、JSON で書き出せます。

## ログインの設定（管理者向け）
Google アカウントでログインできます。パスワードはこのサイトでは一切扱わず、セッションは暗号化された Cookie（HttpOnly・Secure・SameSite=Lax）だけで管理します（データベース不要）。
環境変数がそろうまではログイン機能はオフで、これまでどおり動きます。

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) で「OAuth 同意画面」を作成（ユーザーの種類: 外部、スコープは既定の email / profile / openid のみ）。
2. 「認証情報を作成 → OAuth クライアント ID → ウェブ アプリケーション」を作成し、承認済みのリダイレクト URI に
   `https://music-extractor-frontend.vercel.app/api/auth/callback/google` を追加。
3. Vercel の環境変数に `AUTH_SECRET`（長い乱数）・`AUTH_GOOGLE_ID`・`AUTH_GOOGLE_SECRET` を設定し、再デプロイ。
4. サーバーの AI / YouTube キーを使わせたい人のメールを `SERVER_KEY_EMAILS` にカンマ区切りで設定。

- ログイン有効時は、抽出・お問い合わせにログインが必要です（`AUTH_ALLOW_GUEST=true` で未ログインも可）。
- Google でメールアドレス確認済みのアカウントのみ受け付けます。Cookie に保存するのはメールと表示名だけです。

## セキュリティ対策
- ページごとに nonce を発行する厳格な Content-Security-Policy（`proxy.ts`）と、HSTS・X-Frame-Options 等のヘッダー（`next.config.ts`）。
- API は送信元（Origin）を確認して別サイトからの送信を拒否、アカウント / IP 単位のレート制限。
- 入力 URL の取得は、名前解決後の IP を検査して内部ネットワークへのアクセスを拒否し、リダイレクト先も毎回検査（SSRF 対策・`lib/server/safe-fetch.ts`）。
- リクエスト本文・共有リンク・バックアップは型と長さを検証してから使用（`lib/sanitize.ts`）。
- API キーは共有リンク・バックアップに含めず、サーバーのキーは許可したアカウントだけが利用可能。

## API
- `POST /api/extract` … 抽出本体
- `GET /api/health` … この利用者が使えるサーバー側キーの有無・ログイン状態
- `POST /api/contact` … お問い合わせ（宛先は環境変数 `CONTACT_EMAIL`）
- `/api/auth/*` … Google ログイン（Auth.js）

## 開発
```bash
npm install
cp .env.example .env.local   # 必要なキーを記入
npm run dev
```

## デプロイ
GitHub の `main` に push すると Vercel が自動デプロイします。環境変数は `.env.example` を参照して Vercel に設定してください。
