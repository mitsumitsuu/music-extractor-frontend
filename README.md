# 楽曲抽出システム v2

YouTube（動画・プレイリスト）/ SoundCloud / ランキングページ / テキスト / CSV・Excel / PDF・画像 から
ボカロ曲を抽出し、絞り込み・Excel/CSV/画像/PDF/M3U8/rekordbox XML への書き出し・YouTube連続再生プレイリスト作成ができる Web アプリです。

- フロント・API ともに Next.js（App Router）。**Vercel だけで完結**します（以前の `127.0.0.1:8000` の FastAPI は不要）。
- PC・スマホ両対応のレスポンシブ UI（スマホは下部に操作バー、ホーム画面に追加でアプリ化＝PWA）。
- プリセット・履歴・設定はブラウザに自動保存。バックアップ(JSON)で端末間移行。

## モード
| モード | 必要なキー | 内容 |
|---|---|---|
| ⚡ 高速 | なし | 動画タイトル・テキストを規則ベースで解析 |
| ✨ AI抽出 | Gemini または OpenAI | 資料全体（Webページ・PDF・画像含む）をAIが解析。BPM/Key/MMD/テーマ判定 |
| 📊 統計 | YouTube Data API | 再生数・コメント数で絞り込み（URLの無い曲は先頭20曲まで自動検索） |

AIエンジンは「おまかせ」で Gemini を優先し、失敗時は ChatGPT に自動フォールバックします。

## 抽出後の編集・選択
- 結果の各曲にある「編集」で、曲名・ボカロP・合成音声・BPM・Key・MMD・動画URLを補正できます。
- 編集内容は履歴に自動保存され、Excel/CSV等の書き出しと連続再生にも反映されます。歌詞・Tunebat等の検索リンクも更新されます。
- 動画URLを変更した場合、以前の動画の再生数・コメント数・公開日は引き継ぎません。
- 「表示中の曲を選択」で検索結果をまとめて選択できます。スマホでも利用でき、検索で隠れている選択曲は維持されます。
- キャンセルした編集は反映されません。履歴はこのブラウザ・端末に保存されます。

## API
- `POST /api/extract` … 抽出本体
- `GET /api/health` … サーバー側に設定済みのキーの有無
- `POST /api/contact` … お問い合わせ（宛先は環境変数 `CONTACT_EMAIL`）

## 開発
```bash
npm install
cp .env.example .env.local   # 必要なキーを記入
npm run dev
```

## デプロイ
GitHub の `main` に push すると Vercel が自動デプロイします。環境変数は `.env.example` を参照して Vercel に設定してください。
