// 簡易アクセス制御（合言葉 + IPごとのレート制限）
const hits = new Map<string, number[]>();

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** 問題なければ null、拒否する場合はエラーレスポンスを返す */
export function guard(req: Request, limitPerMin = 12): Response | null {
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers.get("x-app-passcode") !== pass) {
    return Response.json({ error: "合言葉が違います。設定画面で合言葉を入力してください。" }, { status: 401 });
  }
  const ip = clientIp(req);
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= limitPerMin) {
    return Response.json({ error: "リクエストが多すぎます。1分ほど待ってから再試行してください。" }, { status: 429 });
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return null;
}
