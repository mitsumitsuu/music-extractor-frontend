# 設定手順

## ローカルで動かす
必要なもの: Node.js 22 以上（CI は 24）と npm。

```bash
npm ci
cp .env.example .env.local   # 必要な項目だけ記入（全部空でも動く）
npm run dev                  # http://localhost:3000
```

### `npm ci` が `cdn.sheetjs.com` で 403 になるとき
Excel 読み書き用の `xlsx` は配布元（`cdn.sheetjs.com`）から取得します。社内ネットワーク・サンドボックスなどでこのホストが遮断されていると `npm ci` が失敗します。次のどちらかで対処してください。

- ネットワーク側で `cdn.sheetjs.com` を許可する（推奨。`package-lock.json` の integrity で改ざん検知される）。
- 画面の確認だけなら、`package.json` と `package-lock.json` を変更せずに、一時的に npm 版を入れる: `npm i --no-save xlsx@0.18.5`（本番には使わない）。

## API キー（全部無料の範囲で使える）
| 用途 | 取得先 | 費用 |
|---|---|---|
| AI 抽出（おすすめ） | [Google AI Studio](https://aistudio.google.com/apikey) で Gemini の API キー | 無料枠あり |
| 再生数・プレイリスト全件 | [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com) で YouTube Data API v3 を有効化し、API キーを作成 | 無料枠（1日の割り当て）あり |
| AI 抽出（予備） | OpenAI | 有料 |

入れ方は2通りです。

1. **各自が入れる**: 画面右上「設定」→「APIキー」に入力（その端末のブラウザだけで使う）。
2. **サーバーに入れる**: Vercel の環境変数 `GEMINI_API_KEY` / `YOUTUBE_API_KEY` などに設定し、使ってよい人のメールを `SERVER_KEY_EMAILS` に書く（[環境変数一覧](env.md)）。

> キーを使うと API の利用枠を消費します。サーバーのキーは信頼できる人だけが使えるようにしてください。

## Google ログイン（管理者向け・任意）
パスワードはこのサイトでは扱いません。必要な環境変数がそろうまでログインはオフで、これまでどおり動きます。

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) で「OAuth 同意画面」を作成（ユーザーの種類: 外部、スコープは既定の email / profile / openid のみ）。
2. 「認証情報を作成 → OAuth クライアント ID → ウェブ アプリケーション」を作り、**承認済みのリダイレクト URI** に次を追加する。
   - 本番: `https://<本番のドメイン>/api/auth/callback/google`
   - ローカル: `http://localhost:3000/api/auth/callback/google`
3. `AUTH_SECRET`（`openssl rand -base64 32` などで作る長い乱数）・`AUTH_GOOGLE_ID`・`AUTH_GOOGLE_SECRET` を設定して再起動 / 再デプロイ。
4. サーバーの API キーを使わせたい人のメールを `SERVER_KEY_EMAILS` にカンマ区切りで入れる。
5. 未ログインでも使わせたいときだけ `AUTH_ALLOW_GUEST=true`。

注意:
- Vercel のプレビュー URL（`*.vercel.app` のブランチごとの URL）は Google 側にリダイレクト URI を登録できないため、プレビューではログインできません（確認は本番か、ログイン無効の状態で）。
- Google でメールアドレス確認済みのアカウントだけを受け付けます。Cookie に入るのはメールと表示名だけです。

## 合言葉（ログインを使わない場合の簡易保護）
`APP_PASSCODE` を設定すると、利用者は設定画面で合言葉を入れないと抽出・お問い合わせを使えません。ログイン（Google）を有効にしている場合はそちらを使うのがおすすめです。

## お問い合わせの宛先
`CONTACT_EMAIL` に送信先のメールアドレスを設定します（画面のソースには出ません）。
