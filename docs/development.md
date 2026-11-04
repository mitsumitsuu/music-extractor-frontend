# 開発メモ

## コマンド
| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（http://localhost:3000） |
| `npm run lint` | ESLint |
| `npm test` | 単体テスト（Vitest・約 1 秒）。監視モードは `npm run test:watch` |
| `npm run typecheck` | 型チェック（`tsc --noEmit`） |
| `npm run build` | 本番ビルド |

Pull Request の前に `lint` → `test` → `build` を通します（CI も同じ）。

## 構成
```
app/               画面と API（App Router）
  api/extract      抽出本体 / api/health / api/contact / api/auth
components/        画面の部品（見た目の担当範囲）
lib/               抽出ロジック（純粋関数。サーバー・ブラウザ両対応）
  parse.ts         行の解析・重複除去・絞り込み・リンク生成・CSV 出力の整形
  sanitize.ts      外部から来たデータの検証
  setlist.ts       セトリ（時間計算・BPM/Key の流れ・書き出し）
  performed.ts     演奏済みリスト
  stats.ts         集計・ランダム選択
  song-edit.ts     曲情報の編集の検証
  exporters.ts     書き出し（ブラウザ）
  storage.ts       ブラウザ保存・共有リンク
  server/          サーバー専用（AI・YouTube・SSRF 対策付き取得・アクセス制御）
tests/             lib/ の単体テスト
docs/              この文書
scripts/           手動で使う補助スクリプト
```

## テスト方針
- 対象は `lib/` の純粋関数（解析・重複除去・整形・検証）。DOM やネットワークを使わないので速く、壊れにくい。
- 外部通信が入る関数は `vi.mock` で境界（`safe-fetch` など）だけ差し替えてテストする。
- 不具合を直したら、再現する入力をテストに追加する（空入力、全角半角、改行コード、巨大入力、重複、記号だらけの曲名は `tests/parse.test.ts` に集めてある）。
- 画面（`components/`）のテストはない。操作の確認は `npm run build` → `next start` で行う。

## 性能の測り方
- **バンドル**: `npm run build` のあと `.next/static/chunks/*.js` の大きさを見る。画面ごとの内訳は `npx next experimental-analyze`（対話 UI。`-o` でファイル出力）。
- **体感速度**: `scripts/bench-ui.mjs`（Playwright。冒頭のコメント参照）。同じ端末で前後を比べる。
- 記録と結果は [`QUALITY_NOTES.md`](../QUALITY_NOTES.md)。

## 性能に関する実装上の約束
- 数百行の一覧は `components/Memo.tsx` の `Memo` で行ごとに描画を止める（チェック・入力のたびに全行を作り直さない）。`Memo` の中は、`deps` に入れた値だけで描画結果が決まるように書く。
- 一覧の行には CSS の `content-visibility: auto` を指定している（`app/globals.css`）。画面外の行のレイアウト・描画が省かれる。
- `xlsx` は書き出し・読み込みのときだけ動的 `import()` で読み込む（初回表示には含まれない）。
- 行の解析（`parseTitleLine` / `parseTextBlock`）は長い行を先に除外する。括弧が閉じない長い行で正規表現が極端に遅くなるため（テストあり）。

## 依存を足すとき
- `xlsx` は配布元が `cdn.sheetjs.com` のため、ネットワークによっては `npm ci` が失敗する。詳しくは [設定手順](setup.md)。
- `package-lock.json` は `npm install` で更新し、手で編集しない。
