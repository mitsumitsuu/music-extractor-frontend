import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * お問い合わせをサーバー経由で FormSubmit に転送する。
 * 宛先メールアドレスを画面のソースコードに出さないため（環境変数 CONTACT_EMAIL）。
 */
export async function POST(req: Request) {
  const blocked = guard(req, 3);
  if (blocked) return blocked;
  const to = process.env.CONTACT_EMAIL || "yukimitsuyamamura0315@gmail.com";
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "送信内容を読み取れませんでした。" }, { status: 400 });
  }
  const body = String(form.get("message") ?? "").trim();
  if (!body) return Response.json({ error: "内容を入力してください。" }, { status: 400 });
  if (body.length > 5000) return Response.json({ error: "内容は5000文字以内にしてください。" }, { status: 400 });
  // ボット対策（人間には見えない入力欄に値があれば破棄）
  if (String(form.get("website") ?? "")) return Response.json({ ok: true });

  const out = new FormData();
  out.append("_subject", `[楽曲抽出システム] ${String(form.get("subject") ?? "お問い合わせ").slice(0, 120)}`);
  out.append("件名", String(form.get("subject") ?? ""));
  out.append("メッセージ", body);
  out.append("返信先", String(form.get("reply") ?? "").slice(0, 200));
  out.append("_captcha", "false");
  let size = 0;
  for (const [k, v] of form.entries()) {
    if (k.startsWith("attachment") && v instanceof File) {
      size += v.size;
      if (size > 4_000_000) return Response.json({ error: "添付ファイルは合計4MBまでです。" }, { status: 400 });
      out.append(k, v, v.name);
    }
  }
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, { method: "POST", body: out, headers: { Accept: "application/json" } });
    if (!res.ok) return Response.json({ error: "送信に失敗しました。時間をおいて再度お試しください。" }, { status: 502 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "通信エラーが発生しました。" }, { status: 502 });
  }
}
