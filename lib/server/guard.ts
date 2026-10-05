// アクセス制御（ログイン・合言葉・送信元チェック・レート制限）。API ルートの先頭で必ず呼ぶ。
import { timingSafeEqual } from "node:crypto";
import { auth, authEnabled } from "@/auth";

export type Viewer = { email: string; name: string };

const hits = new Map<string, number[]>();

const list = (v?: string) => (v ?? "").split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** ログイン必須か（ログイン有効時の既定。AUTH_ALLOW_GUEST=true で未ログインでも利用可） */
export const loginRequired = () => authEnabled && process.env.AUTH_ALLOW_GUEST !== "true";

export async function getViewer(): Promise<Viewer | null> {
  if (!authEnabled) return null;
  try {
    const s = await auth();
    const email = s?.user?.email;
    return email ? { email, name: s.user?.name || email } : null;
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
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 別サイトからの POST（CSRF）を拒否。ブラウザは Origin を付けるため、ホストとの一致を確認する */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // 同一オリジンの一部リクエスト・サーバー間通信
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
  const pass = process.env.APP_PASSCODE;
  if (pass && !safeEqual(req.headers.get("x-app-passcode") ?? "", pass)) {
    return { error: deny("合言葉が違います。設定画面で合言葉を入力してください。", 401) };
  }
  const viewer = await getViewer();
  if (loginRequired() && !viewer) return { error: deny("この機能を使うにはログインしてください（右上の「ログイン」から）。", 401) };

  // レート制限（ログイン中はアカウント単位、未ログインは IP 単位）
  const id = viewer ? `u:${viewer.email}` : `ip:${clientIp(req)}`;
  const now = Date.now();
  const arr = (hits.get(id) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= limitPerMin) return { error: deny("リクエストが多すぎます。1分ほど待ってから再試行してください。", 429) };
  arr.push(now);
  hits.set(id, arr);
  if (hits.size > 5000) hits.clear();
  return { viewer };
}
