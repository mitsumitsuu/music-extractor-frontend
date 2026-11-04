# デプロイ手順

Vercel だけで完結します（別のバックエンドは不要）。

## 初回
1. GitHub のこのリポジトリを Vercel に Import する（Framework は Next.js が自動判定。ビルド設定は変えない）。
2. Project → Settings → Environment Variables に必要な項目を設定する（[環境変数一覧](env.md)。すべて任意）。Production / Preview / Development のどこで使うか選ぶ。
3. Google ログインを使う場合は、Google 側の承認済みリダイレクト URI に本番ドメインの `/api/auth/callback/google` を追加（[設定手順](setup.md)）。
4. Deploy。

## 通常の更新
1. 作業ブランチで変更し、手元で次の3つを通す。
   ```bash
   npm run lint
   npm test
   npm run build
   ```
2. ブランチを push して Pull Request を作る。GitHub Actions（`.github/workflows/ci.yml`）が同じ3つを実行する。Vercel がプレビューをビルドする。
3. `main` にマージすると Vercel が本番に自動デプロイする。**`main` へ直接 push しない**。

## 環境変数を変えたとき
値を変えただけでは反映されません。Deployments から対象のデプロイを「Redeploy」してください。

## デプロイ後の確認（スモークテスト）
- `https://<ドメイン>/api/health` が `200` と JSON を返す（キーの有無・ログイン状態だけで、値は含まれない）。
- トップが開き、テキストに数行入れて「抽出スタート」で結果が出る（高速モード・キー不要）。
- ログインを設定した場合は、ログインしてアカウントが表示される。
- iPhone / Android で開き、「ホーム画面に追加」のアイコンが表示される。

## 元に戻す
Vercel の Deployments で直前の正常なデプロイを選び、「Promote to Production」（または Instant Rollback）。コードを戻す場合は `git revert` した Pull Request を `main` にマージする。

## 運用メモ
- 無料のプランの範囲で運用する前提。外部 API（Gemini・YouTube）の無料枠を超えると該当機能が失敗するだけで、他の機能は動く。
- レート制限は 1 インスタンス内のメモリ上の簡易なもの（`/api/extract` は 1 分 12 回、お問い合わせは 3 回）。厳密にしたい場合は Vercel の Firewall でルールを追加する。
- `xlsx` は `cdn.sheetjs.com` から取得される。ビルド環境から到達できないと `npm ci` が失敗する（Vercel・GitHub Actions では通常問題なし）。
