// 画面の体感速度（数百曲の入力・結果表示・選択・検索）を計測する手動スクリプト。CI では実行しない。
//
// 使い方:
//   npm run build && npx next start -p 3111      # 別のターミナルで起動（認証なし・キーなしの状態）
//   node scripts/bench-ui.mjs 500                # 500 曲で計測（既定 500）
//   BASE_URL=http://localhost:3111 node scripts/bench-ui.mjs
//
// Playwright が必要（このリポジトリの依存には含めていない）: `npx playwright install chromium` のあと
// `npm i --no-save playwright` で一時的に入れる。結果は端末の性能で大きく変わるため、同じ端末での前後比較に使うこと。
import { createRequire } from "node:module";

const base = process.env.BASE_URL ?? "http://localhost:3111";
const n = Number(process.argv[2] ?? 500);

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  try {
    ({ chromium } = createRequire(import.meta.url)("playwright")); // グローバルに入れている場合（NODE_PATH）
  } catch {
    console.error("playwright が見つかりません。`npm i --no-save playwright` を実行してください。");
    process.exit(1);
  }
}

const frames = (page, fn) => page.evaluate(async (src) => {
  const t = performance.now();
  new Function(`return (${src})`)()();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return Math.round(performance.now() - t);
}, fn.toString());

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(base, { waitUntil: "load" });
await page.getByRole("button", { name: "テキスト", exact: true }).click();
await page.getByRole("button", { name: "URL", exact: true }).click();
const box = page.getByLabel("曲リストのテキスト");
await box.fill(Array.from({ length: n }, (_, i) => `${i + 1}位 テスト曲${i}${i % 7 === 0 ? "!!!" : ""} / ボカロP${i % 40} feat. 初音ミク`).join("\n"));

let t = Date.now();
await page.getByRole("button", { name: /抽出スタート/ }).first().click();
await page.waitForSelector('ul[aria-label="抽出された曲"] > li', { timeout: 120_000 });
console.log(`曲数 ${n}`);
console.log("抽出ボタン → 一覧表示 (ms):", Date.now() - t, "（サーバー処理を含む）");
console.log("DOM ノード数:", await page.evaluate(() => document.getElementsByTagName("*").length));

console.log("1曲のチェック切替 → 2フレーム (ms):", await frames(page, () => document.querySelectorAll('ul[aria-label="抽出された曲"] input[type=checkbox]')[3].click()));
console.log("すべて選択 → 2フレーム (ms):", await frames(page, () => document.querySelector('input[type=checkbox]:not([aria-label$="を選択"])')?.click()));
await box.click();
t = Date.now();
for (let i = 0; i < 20; i++) await page.keyboard.type("あ", { delay: 0 });
console.log("結果表示中の入力 20 文字 (ms):", Date.now() - t, "（1文字あたり", Math.round((Date.now() - t) / 20), "ms、入力操作の待ちを含む）");
console.log("結果の検索 → 2フレーム (ms):", await frames(page, () => {
  const el = document.querySelector("input[type=search]");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "テスト曲1");
  el.dispatchEvent(new Event("input", { bubbles: true }));
}));
await browser.close();
