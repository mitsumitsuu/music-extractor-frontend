import type { HealthResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** どのAPIキーがサーバー側に設定済みかを返す（キーの値自体は返さない） */
export function GET() {
  const body: HealthResponse = {
    youtube: !!process.env.YOUTUBE_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    passcodeRequired: !!process.env.APP_PASSCODE,
    contact: true,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
