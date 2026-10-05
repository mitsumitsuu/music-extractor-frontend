import { authEnabled } from "@/auth";
import { canUseServerKeys, getViewer, loginRequired } from "@/lib/server/guard";
import type { HealthResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** この利用者がサーバー側のキーを使えるか・ログイン状態を返す（キーの値自体は返さない） */
export async function GET() {
  const viewer = await getViewer();
  const server = canUseServerKeys(viewer);
  const body: HealthResponse = {
    youtube: server && !!process.env.YOUTUBE_API_KEY,
    gemini: server && !!process.env.GEMINI_API_KEY,
    openai: server && !!process.env.OPENAI_API_KEY,
    passcodeRequired: !!process.env.APP_PASSCODE,
    contact: true,
    auth: { enabled: authEnabled, required: loginRequired(), user: viewer },
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store, private" } });
}
