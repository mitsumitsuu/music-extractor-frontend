// アクセス制御（ログイン・合言葉・送信元チェック・レート制限）。API ルートの先頭で必ず呼ぶ。
import { createHash, timingSafeEqual } from "node:crypto";
import { auth, authEnabled, isAllowedEmail } from "@/auth";

export type Viewer = { email: string; name: string };

const hits = new Map<string, number[]>();
const MAX_TRACKED = 5000;

/** 直近 windowMs の間に limit 回を超えたら true。古い記録から順に捨てる（全消去で制限をリセットさせない） */
function overLimit(map: Map<string, number[]>, id: string, limit: number, windowMs: number, record = true): boolean {
  const now = Date.now();
  const arr = (map.get(id) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    map.set(id, arr);
    return true;
  }
  if (record) arr.push(now);
  map.delete(id); // 末尾へ移動（Map は挿入順＝古い順に捨てられる）
  map.set(id, arr);
  while (map.size > MAX_TRACKED) map.delete(map.keys().next().value as string);
  return false;
}

/** 合言葉の総当たり対策：失敗は IP ごとに 10 分で 10 回まで */
const failures = new Map<string, number[]>();

const list = (v?: string) => (v ?? "").split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** ログイン必須か（ログイン有効時の既定。AUTH_ALLOW_GUEST=true で未ログインでも利用可） */
export const loginRequired = () => authEnabled && process.env.AUTH_ALLOW_GUEST !== "true";

export async function getViewer(): Promise<Viewer | null> {
  if (!authEnabled) return null;
  try {
    const s = await auth();
    const email = s?.user?.email;
    // 許可リストを後から絞った場合に、すでに発行済みのセッションも無効にする
    return email && isAllowedEmail(email) ? { email, name: s.user?.name || email } : null;
  } catch {
    return null;
  }
}

/**
 * サーバーに設定した API キーを使ってよいか。
 * ログイン有効時は SERVER_KEY_EMAILS に登録したメールの人だけ（未登録なら誰も使えない＝安全側）。
 * ログイン未設定時は従来どおり（APP_PASSCODE で保護）。
 */
export function canUseServerKeys(viewer: Viewer | null): boolean {
  if (!authEnabled) return true;
  return !!viewer && list(process.env.SERVER_KEY_EMAILS).includes(viewer.email.toLowerCase());
}

export function clientIp(req: Request): string {
  // Vercel は x-vercel-forwarded-for / x-forwarded-for をエッジで上書きするため、クライアントが偽装できない
  const h = (n: string) => (req.headers.get(n) ?? "").split(",")[0].trim();
  return (h("x-vercel-forwarded-for") || h("x-forwarded-for") || h("x-real-ip") || "unknown").slice(0, 64);
}

/** 長さに依存しない定数時間比較（ハッシュ化してから比べる） */
function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest(), y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** 別サイトからの POST（CSRF）を拒否。ブラウザは Origin を付けるため、ホストとの一致を確認する */
function sameOrigin(req: Request): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // 同一オリジンの一部リクエスト・サーバー間通信（ブラウザの別サイトからの POST は必ず Origin が付く）
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const deny = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** 問題なければ { viewer }、拒否する場合は { error: Response } */
export async function guard(req: Request, limitPerMin = 12): Promise<{ viewer: Viewer | null; error?: undefined } | { error: Response }> {
  if (req.method !== "GET" && !sameOrigin(req)) return { error: deny("不正な送信元からのリクエストです。", 403) };
  const ip = clientIp(req);
  const pass = process.env.APP_PASSCODE;
  if (pass) {
    if (overLimit(failures, ip, 10, 10 * 60_000, false)) return { error: deny("試行回数が多すぎます。しばらく待ってから再試行してください。", 429) };
    if (!safeEqual((req.headers.get("x-app-passcode") ?? "").slice(0, 200), pass)) {
      overLimit(failures, ip, 10, 10 * 60_000);
      return { error: deny("合言葉が違います。設定画面で合言葉を入力してください。", 401) };
    }
  }
  const viewer = await getViewer();
  if (loginRequired() && !viewer) return { error: deny("この機能を使うにはログインしてください（右上の「ログイン」から）。", 401) };

  // レート制限（ログイン中はアカウント単位、未ログインは IP 単位）
  const id = viewer ? `u:${viewer.email}` : `ip:${ip}`;
  if (overLimit(hits, id, limitPerMin, 60_000)) return { error: deny("リクエストが多すぎます。1分ほど待ってから再試行してください。", 429) };
  return { viewer };
}
