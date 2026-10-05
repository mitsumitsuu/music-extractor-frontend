import { authEnabled, handlers } from "@/auth";

export const runtime = "nodejs";

const disabled = () => Response.json({ error: "ログイン機能は設定されていません。" }, { status: 404 });

export const GET = (req: Request) => (authEnabled ? handlers.GET(req as Parameters<typeof handlers.GET>[0]) : disabled());
export const POST = (req: Request) => (authEnabled ? handlers.POST(req as Parameters<typeof handlers.POST>[0]) : disabled());
