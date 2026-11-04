import { guard } from "@/lib/server/guard";
import { readBodyLimited } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 5;
const MAX_BYTES = 4_000_000;
const MAX_BODY_BYTES = 4_600_000;
const EMAIL = /^[^\s@<>()[\],;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;

/** ファイル先頭の数バイトで実際の形式を確認する（ブラウザが申告する Content-Type は偽装できるため） */
function looksLikeMedia(b: Uint8Array): boolean {
  const eq = (o: number, sig: number[]) => sig.every((x, i) => b[o + i] === x);
  return (
    eq(0, [0x89, 0x50, 0x4e, 0x47]) || // PNG
    eq(0, [0xff, 0xd8, 0xff]) || // JPEG
    eq(0, [0x47, 0x49, 0x46, 0x38]) || // GIF
    (eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50])) || // WebP
    eq(4, [0x66, 0x74, 0x79, 0x70]) || // MP4 / MOV / HEIC（ISO BMFF の ftyp）
    eq(0, [0x1a, 0x45, 0xdf, 0xa3]) // WebM
  );
}

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
  // 宛先は環境変数だけで持つ（公開リポジトリのソースに個人のアドレスを書かない）。未設定ならお問い合わせは停止
  const to = process.env.CONTACT_EMAIL?.trim();
  if (!to) return fail("お問い合わせは現在準備中です。", 503);
  let form: FormData;
  try {
    // 先に受信サイズを上限つきで読んでから解析する（巨大な送信でメモリを使い切られないように）
    const raw = await readBodyLimited(req, MAX_BODY_BYTES);
    if (!raw) return fail("送信内容が大きすぎます。", 413);
    form = await new Response(raw as BodyInit, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
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
    if (!/^(image|video)\/[\w.+-]+$/.test(v.type) || v.type === "image/svg+xml") return fail("添付できるのは画像・動画のみです。");
    if (!looksLikeMedia(new Uint8Array(await v.slice(0, 16).arrayBuffer()))) return fail("添付できるのは画像・動画のみです。");
    size += v.size;
    if (++n > MAX_FILES) return fail(`添付ファイルは${MAX_FILES}個までです。`);
    if (size > MAX_BYTES) return fail("添付ファイルは合計4MBまでです。");
    out.append(`attachment_${n}`, v, oneLine(v.name, 100) || `file_${n}`);
  }
  try {
    // FormSubmit は送信元ページ（Referer）でフォームを識別するため、サーバーからの送信でもこのサイトの URL を付ける
    const site = new URL(req.url).origin;
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: "POST",
      body: out,
      headers: { Accept: "application/json", Referer: `${site}/`, Origin: site },
      signal: AbortSignal.timeout(15_000),
    });
    // FormSubmit は未有効化などの失敗でも 200 と { success: "false" } を返すため、本文まで確認する
    const j = (await res.json().catch(() => null)) as { success?: unknown } | null;
    if (!res.ok || !(j?.success === true || j?.success === "true")) return fail("送信に失敗しました。時間をおいて再度お試しください。", 502);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("通信エラーが発生しました。", 502);
  }
}
