// API ルート共通の入出力ヘルパー（サーバー専用）

/** 本文をサイズ上限つきで読む。Content-Length の自己申告だけでなく、実際に受信したバイト数でも打ち切る */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** JSON 本文を上限つきで読む。大きすぎる場合は "too_large"、不正な JSON は "invalid" */
export async function readJsonLimited(req: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; reason: "too_large" | "invalid" }> {
  const body = await readBodyLimited(req, maxBytes);
  if (!body) return { ok: false, reason: "too_large" };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/**
 * 利用者に見せてよいエラーメッセージに整える。
 * 外部 API のエラー文には、リクエストに使ったキーやトークンが含まれることがあるため、伏せ字にして長さも制限する。
 */
export function publicError(e: unknown, secrets: (string | undefined)[] = []): string {
  let msg = e instanceof Error ? e.message : String(e);
  for (const s of secrets) if (s && s.length >= 8) msg = msg.split(s).join("***");
  msg = msg
    .replace(/(AIza[\w-]{20,}|sk-[\w-]{16,}|ya29\.[\w.-]+|Bearer\s+[\w.~+/-]+=*)/g, "***")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim();
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg || "エラー";
}
