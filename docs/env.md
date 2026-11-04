# 環境変数一覧

値は書きません。ローカルは `.env.local`、本番は Vercel の Project → Settings → Environment Variables に設定します（雛形は [`.env.example`](../.env.example)）。すべて任意で、未設定でもアプリは動きます。変更後は再デプロイが必要です。

| 名前 | 用途 | 未設定のとき |
|---|---|---|
| `AUTH_SECRET` | ログインのセッション暗号化用の長い乱数（`openssl rand -base64 32` など） | ログイン機能オフ |
| `AUTH_GOOGLE_ID` | Google OAuth クライアント ID | ログイン機能オフ |
| `AUTH_GOOGLE_SECRET` | Google OAuth クライアント シークレット | ログイン機能オフ |
| `SERVER_KEY_EMAILS` | サーバーの API キーを使ってよいアカウントのメール（カンマ区切り） | ログイン有効時は誰も使えない（各自が設定画面で自分のキーを入力） |
| `AUTH_ALLOW_GUEST` | `true` で未ログインでも抽出できる | ログイン有効時はログイン必須 |
| `AUTH_ALLOWED_EMAILS` | ログインできるアカウントを絞る（メール、または `@example.ac.jp` のような `@ドメイン`。カンマ区切り） | メール確認済みの Google アカウントなら誰でも |
| `GEMINI_API_KEY` | AI 抽出（Gemini） | 利用者が設定画面で入力したキーのみ |
| `OPENAI_API_KEY` | AI 抽出（ChatGPT。有料） | 同上 |
| `GEMINI_MODEL` | Gemini のモデル固定 | 利用可能なモデルを自動選択 |
| `OPENAI_MODEL` | OpenAI のモデル固定 | 同上 |
| `YOUTUBE_API_KEY` | YouTube Data API v3（プレイリスト全件・再生数・コメント数） | キーなしの簡易取得（件数に上限） |
| `APP_PASSCODE` | ログインを使わない場合の簡易保護（利用時に合言葉が必要） | 合言葉なし |
| `CONTACT_EMAIL` | お問い合わせの送信先 | 管理者の既定アドレスに送信 |

## ログインの有効条件
`AUTH_SECRET`・`AUTH_GOOGLE_ID`・`AUTH_GOOGLE_SECRET` の **3つすべて**がそろったときだけ有効になります。1つでも欠けるとログインなしで動きます。

## サーバーのキーの使われ方
- 利用者本人が設定画面に入れたキーが常に優先されます。
- サーバーのキー（`GEMINI_API_KEY` / `OPENAI_API_KEY` / `YOUTUBE_API_KEY`）は、ログイン無効時は誰でも、ログイン有効時は `SERVER_KEY_EMAILS` に載ったアカウントだけが使えます。
- キーの値は API で返さず、共有リンク・バックアップにも含みません。
- `GEMINI_API_KEY` などは `NEXT_PUBLIC_` を付けないこと（付けるとブラウザに配られます）。
