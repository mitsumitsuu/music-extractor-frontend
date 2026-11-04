# セキュリティ点検記録（2026-11-04）

対象: `auth.ts` / `proxy.ts` / `app/api/*` / `lib/` / `next.config.ts` / 依存パッケージ / 環境変数 / ログ。
確認方法: コード精読、`npm audit`、ローカルで `next start` して curl・Playwright（Chromium）で動作確認。

## 修正した点

| 区分 | 内容 |
|---|---|
| 依存（重大） | `next` 16.3.8 → **16.4.5**（SVG画像最適化・`use cache` 経由のリモートコード実行、Server Actions の DoS など 3 件を解消）。`eslint-config-next` も同バージョン。`npm audit fix` で `zod`・`source-map-js`（high）も解消。 |
| SSRF | `lib/server/safe-fetch.ts` を `node:http(s)` ＋ **接続時の IP 検査**に変更。従来は「名前解決→検査→`fetch` が再解決」で、検査後に内部 IP へ差し替える DNS リバインディングが可能だった。IPv4 射影・6to4・Teredo・NAT64 なども拒否。圧縮（gzip/br）の展開後サイズにも上限（zip bomb 対策）。 |
| 入力検証 | `/api/extract` と `/api/contact` の本文を、受信バイト数ベースで上限つきで読む（自己申告の Content-Length に依存しない）。YouTube の動画ID・リストIDを厳密な形式検証（`&key=…` などの API URL への混入を防止）。外部 API 呼び出しのクエリを `encodeURIComponent` で統一。URL 取得の同時実行を 5 に制限。SoundCloud 判定をホスト名で厳密化。 |
| AI 出力 | 型・長さ・件数（1000）・URL 形式（http/https のみ、認証情報付きは拒否）を検証。外部 API のエラー本文は 200 文字に切り詰め。 |
| 認証・アクセス制御 | 合言葉（`APP_PASSCODE`）の**総当たり対策**（IP ごとに 10 分 10 回失敗で 429）。合言葉比較をハッシュ化した定数時間比較に。レート制限の全消去（`clear()`）を古い順の削除に変更（大量の別 ID で制限をリセットされない）。`Sec-Fetch-Site: cross-site` も CSRF として拒否。クライアント IP は `x-vercel-forwarded-for` 優先。任意の許可リスト `AUTH_ALLOWED_EMAILS`（メール／`@ドメイン`、未設定なら従来どおり）を追加。`debug: false` を明示。 |
| 情報漏洩 | YouTube API キーを URL（`?key=`）からヘッダー `x-goog-api-key` へ。クライアントに返すエラー文は `publicError()` でキー・トークン様の文字列を伏せ字化し 200 文字に制限。`console.*` によるログ出力は元々なし（確認済み）。 |
| お問い合わせ | 添付をファイル先頭バイト（マジックバイト）でも検証（Content-Type 偽装・SVG 拒否）。HEIC/MOV（iPhone）は許可。 |
| ヘッダー/CSP | `style-src` から **`'unsafe-inline'` を削除**（`<style>` は nonce 付きのみ。`style=""` 属性だけ `style-src-attr` で許可）。Chromium で違反 0 件・表示/モーダル正常を確認。`X-Permitted-Cross-Domain-Policies: none` を追加。マイクは `/` のみ `self`（従来どおり、実ヘッダーで確認）。 |
| クライアント | Excel 読み込み前に 4MB 上限（`PlaylistTool`）。 |
| 2回目の点検で追加 | ① gzip 等で返すサイトが途中で切断／停止すると URL 取得が終わらず関数が最大 60 秒占有される不具合を修正（`pipe()`→`pipeline()`）。② 厳格化した CSP で Next.js 標準の 404 ページ（ノンスなしの `<style>`）が崩れるため、自前の `app/not-found.tsx`・`app/global-error.tsx` を追加（エラー詳細は表示しない）。 |

## 実際に試して確認したこと（ローカルの本番ビルド＋curl／Playwright）
- SSRF: `127.0.0.1`・`localhost`・`[::1]`・`0x7f.1`・`169.254.169.254`、`/etc/hosts` で 127.0.0.1 になる名前（接続時検査）をすべて拒否。途中切断・停止は約 0.3 秒でエラー終了、圧縮爆弾は 2MB で打ち切り。
- CSP: PC／iPhone 13 表示で、抽出→結果→編集→各画面→設定の全タブ→404 まで違反 0 件。
- ログイン（テスト用の鍵で作ったセッション）: 許可リスト内のみログイン扱い、`@oit.ac.jp` 指定で `…@oit.ac.jp.attacker.com` は拒否、改ざん Cookie は拒否、サーバーのキーは `SERVER_KEY_EMAILS` のみ。Google への遷移は PKCE 付き、Cookie は HttpOnly・SameSite=Lax。ログイン/ログアウト後の戻り先に外部 URL を渡しても自サイトに置き換わる（オープンリダイレクトなし）。CSRF トークンなしは拒否。
- お問い合わせ: SVG・EXE を PNG と偽った添付・5MB 超・10MB の本文・別サイトからの送信・不正な返信先をすべて拒否。PNG・HEIC は通過。
- YouTube API キーのヘッダー送信が Google に受理されること（偽キーで「キー無効」応答＝ヘッダーを読んでいる）。

## 問題なしを確認した点
- Google ログイン: メール確認済みのみ、Cookie は JWE・HttpOnly・Secure・SameSite=Lax、保存は最小限（メール・表示名）、サーバーのキーは `SERVER_KEY_EMAILS` のみ（既定は誰も使えない）。
- CSV は数式注入対策済み（`csvCell`）、XML エスケープ済み、`dangerouslySetInnerHTML` は固定のテーマ判定スクリプトのみ（nonce 付き）。
- `.env*` は `.gitignore` 済み（`.env.example` のみコミット）。履歴にキー様の文字列なし。
- **`xlsx`（SheetJS CDN 0.20.3）**: 既知の CVE（プロトタイプ汚染・ReDoS）の修正版。`npm audit` は CDN 版を判定できないため対象外。ブラウザ内で自分のファイルを読む／書き出すだけ（サーバーでは使わない）。ロックファイルに integrity あり。更新は手動確認（https://cdn.sheetjs.com）。

## 残リスク（要判断）
1. **レート制限はサーバーレス1インスタンス内のメモリ**。複数インスタンス間では共有されない。本格対策は Vercel Firewall のレート制限ルール（ダッシュボードで設定）。
2. `npm audit` の moderate 16 件は `eslint` 系ツールの `minimatch`（開発時のみ・本番に含まれない）。修正は eslint のメジャー更新が必要なため見送り。
3. `style-src-attr 'unsafe-inline'` が残る（framer-motion 等のインライン style 属性のため）。スクリプトは nonce＋`strict-dynamic` で保護済み。
4. `CONTACT_EMAIL` 未設定時の既定の宛先が `app/api/contact/route.ts` に直書き。Vercel に `CONTACT_EMAIL` を設定すれば不要（設定後に既定値を削除可）。
5. 合言葉（`APP_PASSCODE`）はブラウザの localStorage に保存される。ログイン（Google）有効時は使わない運用を推奨。
6. `next-auth` は 5.0.0-beta.32（正式版が出たら更新）。
7. **（セキュリティ外の既存不具合）** 抽出画面のファイル上限は 4MB だが、送信時に base64 化され約 5.6MB になり、Vercel の受信上限 4.5MB を超える。3MB 超の PDF・画像は Vercel 側で 413 になる可能性が高い。画面側（`components/ExtractForm.tsx` の `MAX_TOTAL`）は UI 改善の PR と衝突するため未変更。上限を約 3MB にするのが簡単な対処。
8. `style-src-attr` は iOS 15.4 未満の Safari では未対応（その場合スタイル属性が効かない）。2026 年時点で該当端末はごく少数。
9. 本番・プレビューの URL はこの作業環境から閲覧できなかったため、Vercel 上での動作は未確認（ローカルの本番ビルドで確認済み）。
10. このサンドボックスは `cdn.sheetjs.com` に届かないため、`xlsx` 実体なしで lint/build を確認（`xlsx` は動的 import のため影響なし）。CI（GitHub Actions）で `npm ci` が通ることを確認してください。
