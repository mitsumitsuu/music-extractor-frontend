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
| ヘッダー/CSP | `style-src` から **`'unsafe-inline'` を削除**し、`style-src-attr` の許可も不要と確認して削除（`<style>` は nonce 付きのみ。画面はブラウザ側描画で、動的スタイルは CSSOM 経由のため CSP の対象外）。Chromium で違反 0 件・表示/モーダル正常を確認。`X-Permitted-Cross-Domain-Policies: none` を追加。マイクは `/` のみ `self`（従来どおり、実ヘッダーで確認）。 |
| クライアント | Excel 読み込み前に 4MB 上限（`PlaylistTool`）。 |
| 2回目の点検で追加 | ① gzip 等で返すサイトが途中で切断／停止すると URL 取得が終わらず関数が最大 60 秒占有される不具合を修正（`pipe()`→`pipeline()`）。② 厳格化した CSP で Next.js 標準の 404 ページ（ノンスなしの `<style>`）が崩れるため、自前の `app/not-found.tsx`・`app/global-error.tsx` を追加（エラー詳細は表示しない）。 |

| 3回目（残件の解消） | ① 抽出のファイル上限を 4MB→**3MB**（base64 化後 約 4MB で Vercel の受信上限 4.5MB 内）。送信前に全体サイズも確認し、超える場合は送らずに知らせる。② **合言葉は「この端末にキー・合言葉を保存する」がオフなら sessionStorage のみ**（タブを閉じると消える）。③ お問い合わせの宛先の**直書きを削除**（`CONTACT_EMAIL` 未設定なら「準備中」表示・503）。FormSubmit が 200 で失敗（未有効化など）を返しても「送信しました」と出ていた不具合を修正。④ CI に `npm audit --omit=dev --audit-level=high` を追加（本番依存に high 以上が入ったら止める）。 |

## 実際に試して確認したこと（ローカルの本番ビルド＋curl／Playwright）
- SSRF: `127.0.0.1`・`localhost`・`[::1]`・`0x7f.1`・`169.254.169.254`、`/etc/hosts` で 127.0.0.1 になる名前（接続時検査）をすべて拒否。途中切断・停止は約 0.3 秒でエラー終了、圧縮爆弾は 2MB で打ち切り。
- CSP: PC／iPhone 13 表示で、抽出→結果→編集→各画面→設定の全タブ→404 まで違反 0 件。
- ログイン（テスト用の鍵で作ったセッション）: 許可リスト内のみログイン扱い、`@oit.ac.jp` 指定で `…@oit.ac.jp.attacker.com` は拒否、改ざん Cookie は拒否、サーバーのキーは `SERVER_KEY_EMAILS` のみ。Google への遷移は PKCE 付き、Cookie は HttpOnly・SameSite=Lax。ログイン/ログアウト後の戻り先に外部 URL を渡しても自サイトに置き換わる（オープンリダイレクトなし）。CSRF トークンなしは拒否。
- お問い合わせ: SVG・EXE を PNG と偽った添付・5MB 超・10MB の本文・別サイトからの送信・不正な返信先をすべて拒否。PNG・HEIC は通過。
- 3回目: `style-src-attr` を外した状態で PC／iPhone（ダーク）とも 32 個のボタン（書き出し・編集・統計・設定など）を押して CSP 違反 0 件。合言葉は保存オフで sessionStorage のみ・オンで localStorage、合言葉付きの抽出は成功。3.5MB のファイルは画面で止まり、2.9MB は送信サイズ 3.87MB で正常処理。巨大な貼り付けテキストは送信前に警告。
- YouTube API キーのヘッダー送信が Google に受理されること（偽キーで「キー無効」応答＝ヘッダーを読んでいる）。

## 問題なしを確認した点
- Google ログイン: メール確認済みのみ、Cookie は JWE・HttpOnly・Secure・SameSite=Lax、保存は最小限（メール・表示名）、サーバーのキーは `SERVER_KEY_EMAILS` のみ（既定は誰も使えない）。
- CSV は数式注入対策済み（`csvCell`）、XML エスケープ済み、`dangerouslySetInnerHTML` は固定のテーマ判定スクリプトのみ（nonce 付き）。
- `.env*` は `.gitignore` 済み（`.env.example` のみコミット）。履歴にキー様の文字列なし。
- **`xlsx`（SheetJS CDN 0.20.3）**: 既知の CVE（プロトタイプ汚染・ReDoS）の修正版。`npm audit` は CDN 版を判定できないため対象外。ブラウザ内で自分のファイルを読む／書き出すだけ（サーバーでは使わない）。ロックファイルに integrity あり。更新は手動確認（https://cdn.sheetjs.com）。

## 残リスク・対応状況
| # | 内容 | 状態 |
|---|---|---|
| 1 | レート制限がサーバーレス1インスタンス内のメモリのみ（インスタンス間で共有されない） | アプリ側の制限は維持。全体の制限は Vercel Firewall のルールで行う（Vercel のアクセス許可後に設定） |
| 2 | `npm audit` の moderate 16 件（`eslint` 系の `minimatch`） | **対応不要と判断**。本番依存は 0 件（`npm audit --omit=dev`）。lint 実行時だけ使う開発ツールで、パターンは自分の設定ファイルのみ＝攻撃者の入力が届かない。`overrides` で 11 系に上げると `eslint-plugin-import` が壊れる（既定エクスポートがない）ことを確認。CI で本番依存を監視 |
| 3 | `style-src-attr 'unsafe-inline'` | **解消**（不要と確認して削除） |
| 4 | お問い合わせ宛先の直書き | **解消**（ソースから削除。過去のコミット履歴には残るが、公開リポジトリの履歴改変は破壊的なため行わない）。**Vercel に `CONTACT_EMAIL` の設定と FormSubmit の有効化が必要**（下記） |
| 5 | 合言葉の localStorage 保存 | **解消**（保存オフ時は sessionStorage のみ） |
| 6 | `next-auth` 5.0.0-beta.32 | 現時点で v5 の最新（正式版は未公開）。正式版が出たら更新 |
| 7 | 抽出のファイル上限が Vercel の受信上限を超える | **解消**（3MB に変更＋送信前チェック） |
| 8 | `style-src-attr` の iOS 15.4 未満非対応 | **解消**（#3 の削除で無関係に） |
| 9 | Vercel 上での動作確認 | Vercel のアクセス許可後に確認 |
| 10 | `xlsx` を含む `npm ci` | **解消**（GitHub Actions で `npm ci`・lint・build 成功を確認） |

### お問い合わせを動かすために必要なこと
- Gmail に FormSubmit の「Activate Form」メール（2026-08-09、未開封）があり、**まだ有効化されていない**。有効化しないと管理者にメールが届かない（修正前は届かなくても「送信しました」と表示されていた）。
- Vercel の環境変数 `CONTACT_EMAIL` に宛先を設定し、初回送信で届く有効化メールの「Activate Form」を押す。有効化後に届くランダム文字列を `CONTACT_EMAIL` に入れればアドレスも隠せる。
