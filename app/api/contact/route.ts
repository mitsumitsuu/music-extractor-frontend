import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 5;
const MAX_BYTES = 4_000_000;
const EMAIL = /^[^\s@<>()[\],;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;

const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
/** 改行・制御文字を除いた1行テキスト（メール件名のヘッダー注入対策） */
const oneLine = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

/**
 * お問い合わせをサーバー経由で FormSubmit に転送する。
 * 宛先メールアドレスを画面のソースコードに出さないため（環境変数 CONTACT_EMAIL）。
 */
export async function POST(req: Request) {
  const access = await guard(req, 3);
  if (access.error) return access.error;
  const to = process.env.CONTACT_EMAIL || "yukimitsuyamamura0315@gmail.com";
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("送信内容を読み取れませんでした。");
  }
  const body = String(form.get("message") ?? "").trim();
  if (!body) return fail("内容を入力してください。");
  if (body.length > 5000) return fail("内容は5000文字以内にしてください。");
  // ボット対策（人間には見えない入力欄に値があれば破棄）
  if (String(form.get("website") ?? "")) return Response.json({ ok: true });
  const subject = oneLine(form.get("subject"), 120);
  const reply = oneLine(form.get("reply"), 200);
  if (reply && !EMAIL.test(reply)) return fail("返信先メールアドレスの形式が正しくありません。");

  const out = new FormData();
  out.append("_subject", `[楽曲抽出システム] ${subject || "お問い合わせ"}`);
  out.append("件名", subject);
  out.append("メッセージ", body);
  out.append("返信先", reply);
  if (access.viewer) out.append("ログイン中のアカウント", access.viewer.email);
  out.append("_captcha", "false");
  let size = 0, n = 0;
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("attachment") || !(v instanceof File)) continue;
    if (!/^(image|video)\//.test(v.type)) return fail("添付できるのは画像・動画のみです。");
    size += v.size;
    if (++n > MAX_FILES) return fail(`添付ファイルは${MAX_FILES}個までです。`);
    if (size > MAX_BYTES) return fail("添付ファイルは合計4MBまでです。");
    out.append(`attachment_${n}`, v, oneLine(v.name, 100) || `file_${n}`);
  }
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, { method: "POST", body: out, headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return fail("送信に失敗しました。時間をおいて再度お試しください。", 502);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("通信エラーが発生しました。", 502);
  }
}
