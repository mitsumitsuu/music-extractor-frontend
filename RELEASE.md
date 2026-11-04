# Release checklist

このドキュメントはこのリポジトリを正式にリリースするための手順です。

1. ローカル検証
   - 型チェック: `npx tsc --noEmit`
   - ESLint: `npm run lint`
   - 単体テスト: `npm test`
   - プロダクションビルド: `npm run build`
   - 開発サーバで動作確認: `npm run dev`

2. コード整理
   - 余分な `console.log` を削除
   - API エンドポイントやキーは環境変数へ移行（.env.local を使用）

3. バージョン管理
   - ブランチを整理（例: `main` は本番）
   - 変更をコミットしてプッシュ
     ```bash
     git add .
     git commit -m "fix: close missing </div> in app/page.tsx; lint fixes; add CI"
     git push origin main
     ```
   - リリース準備タグを作成
     ```bash
     git tag -a v1.0.0 -m "Release v1.0.0"
     git push origin v1.0.0
     ```

4. CI / CD
   - `.github/workflows/ci.yml` を追加済み（lint + test + build を実行）
   - デプロイは Vercel を推奨。Vercel で GitHub 統合を行い、`main` を本番に紐付ける。
   - Vercel を使う場合、`VERCEL_TOKEN` と必要な環境変数を Vercel プロジェクトに設定する。

5. 環境変数
   - Next.js の `app` 内で利用する API キーやエンドポイントは `process.env` 経由にする。
   - 開発: `.env.local`（例）
   - 本番: Vercel の環境変数設定またはホスティングのシークレット管理を利用

6. ドキュメント
   - `README.md` にリリース手順、環境変数一覧、運用手順を記載
   - 変更点は GitHub Release ノートにまとめる

7. モニタリング
   - エラー集約 (Sentry 等) を導入する場合はトークンを本番環境に設定

---

必要なら、次のいずれかを私が自動で行います:
- GitHub Actions をさらに追加して tag push 時にアーティファクトを作成
- Vercel 用のデプロイワークフローを追加（`VERCEL_TOKEN` が必要）
- `README.md` の更新や `CHANGELOG.md` 追加

どれを進めますか？