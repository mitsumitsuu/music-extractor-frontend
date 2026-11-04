import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// lib/ の純粋関数だけを対象にした単体テスト（ブラウザ・サーバー依存の無い軽量構成）
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
