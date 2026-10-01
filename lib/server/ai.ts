// AI（Gemini / OpenAI）による楽曲情報の抽出（サーバー専用）
import type { UploadFile } from "../types";

export type AiSong = {
  title: string;
  producer?: string;
  vocal?: string;
  bpm?: number;
  key?: string;
  mmd?: "あり" | "なし" | "不明";
  url?: string;
  matchesTheme?: boolean;
};

export type AiResult = { songs: AiSong[]; provider: string; model: string };

const SYSTEM = `あなたはボカロ・合成音声楽曲（VOCALOID / UTAU / CeVIO / Synthesizer V など）に非常に詳しい音楽データ抽出アシスタントです。
与えられた資料（ランキング、動画タイトル一覧、Webページ本文、表、PDF、画像など）から「楽曲」だけを漏れなく抽出し、JSONで返してください。
規則:
- 1曲につき1要素。広告・見出し・ニュース・投稿者名だけの行・重複は除外。
- title は正式な曲名のみ（【MV】やfeat.、順位、記号装飾は除く）。
- producer はボカロP/作者名、vocal は歌唱した合成音声（複数なら「・」区切り）。
- bpm と key は確実に知っている場合のみ（推測しない）。key は "Am", "C#", "F#m" のような表記。
- mmd は、その曲のMMDモーション配布や有名なMMD動画が存在するなら "あり"、ないと確信できるなら "なし"、分からなければ "不明"。
- url は資料に記載がある場合のみ。
- テーマ指定がある場合、各曲がテーマに合うかを matchesTheme で判定。テーマ指定がなければ常に true。
- 資料に無い曲を創作しない。`;

const SCHEMA = {
  type: "object",
  properties: {
    songs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          producer: { type: "string" },
          vocal: { type: "string" },
          bpm: { type: "number" },
          key: { type: "string" },
          mmd: { type: "string", enum: ["あり", "なし", "不明"] },
          url: { type: "string" },
          matchesTheme: { type: "boolean" },
        },
        required: ["title"],
      },
    },
  },
  required: ["songs"],
};

function buildPrompt(material: string, theme: string): string {
  return `${theme ? `テーマ指定: 「${theme}」\n` : "テーマ指定: なし\n"}
以下が資料です。--- から --- の間を解析してください。
---
${material.slice(0, 200_000)}
---
出力形式: {"songs":[{"title":"","producer":"","vocal":"","bpm":0,"key":"","mmd":"不明","url":"","matchesTheme":true}]}`;
}

function parseSongs(text: string): AiSong[] {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const json = JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned) as { songs?: AiSong[] };
  return (json.songs ?? [])
    .filter((s) => s && typeof s.title === "string" && s.title.trim())
    .map((s) => ({
      ...s,
      title: s.title.trim(),
      bpm: typeof s.bpm === "number" && s.bpm > 20 && s.bpm < 400 ? Math.round(s.bpm) : undefined,
      key: s.key?.trim() || undefined,
      producer: s.producer?.trim() || undefined,
      vocal: s.vocal?.trim() || undefined,
      url: s.url && /^https?:\/\//.test(s.url) ? s.url : undefined,
    }));
}

class ModelNotFound extends Error {}

async function callGemini(model: string, key: string, material: string, theme: string, files: UploadFile[], signal?: AbortSignal): Promise<AiSong[]> {
  const parts: Record<string, unknown>[] = [{ text: buildPrompt(material, theme) }];
  for (const f of files) if (f.data) parts.push({ inline_data: { mime_type: f.mime, data: f.data } });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
    }),
  });
  if (res.status === 404) throw new ModelNotFound(model);
  const j = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${j.error?.message ?? "エラー"}`);
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini から空の応答が返りました");
  return parseSongs(text);
}

async function callOpenAI(model: string, key: string, material: string, theme: string, files: UploadFile[], signal?: AbortSignal): Promise<AiSong[]> {
  const content: Record<string, unknown>[] = [{ type: "text", text: buildPrompt(material, theme) }];
  for (const f of files) {
    if (!f.data) continue;
    if (f.mime.startsWith("image/")) content.push({ type: "image_url", image_url: { url: `data:${f.mime};base64,${f.data}` } });
    else if (f.mime === "application/pdf") content.push({ type: "file", file: { filename: f.name, file_data: `data:application/pdf;base64,${f.data}` } });
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (res.status === 404 || j.error?.code === "model_not_found") throw new ModelNotFound(model);
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${j.error?.message ?? "エラー"}`);
  const text = j.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenAI から空の応答が返りました");
  return parseSongs(text);
}

const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

/**
 * provider=auto の場合は Gemini を優先（PDF/画像に強く、日本語の長文資料を安価に処理できるため）。
 * 失敗時はもう一方のプロバイダにフォールバックする。
 */
export async function extractWithAi(opts: {
  provider: "auto" | "gemini" | "openai";
  geminiKey?: string;
  openaiKey?: string;
  material: string;
  theme: string;
  files: UploadFile[];
  signal?: AbortSignal;
}): Promise<AiResult> {
  const order: ("gemini" | "openai")[] =
    opts.provider === "openai" ? ["openai", "gemini"] : opts.provider === "gemini" ? ["gemini", "openai"] : ["gemini", "openai"];
  const errors: string[] = [];
  for (const p of order) {
    const key = p === "gemini" ? opts.geminiKey : opts.openaiKey;
    if (!key) continue;
    const models =
      p === "gemini"
        ? uniq([process.env.GEMINI_MODEL, "gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-flash"])
        : uniq([process.env.OPENAI_MODEL, "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"]);
    const before = errors.length;
    let done = false;
    for (const model of models) {
      if (done) break;
      try {
        const songs =
          p === "gemini"
            ? await callGemini(model, key, opts.material, opts.theme, opts.files, opts.signal)
            : await callOpenAI(model, key, opts.material, opts.theme, opts.files, opts.signal);
        return { songs, provider: p, model };
      } catch (e) {
        if (e instanceof ModelNotFound) continue;
        errors.push(e instanceof Error ? e.message : String(e));
        done = true;
      }
    }
    if (errors.length === before) errors.push(`${p}: 利用可能なモデルが見つかりません（環境変数 ${p === "gemini" ? "GEMINI_MODEL" : "OPENAI_MODEL"} で指定してください）`);
  }
  if (!errors.length) throw new Error("AIのAPIキーが設定されていません（Gemini または OpenAI）。");
  throw new Error(errors.join(" / "));
}
