import { extractWithAi } from "@/lib/server/ai";
import { guard } from "@/lib/server/guard";
import { fetchPageText, fetchPlaylistIds, fetchPlaylistIdsKeyless, fetchVideos, oembed, searchVideo, searchVideoKeyless, type VideoInfo } from "@/lib/server/youtube";
import { applyFilters, buildLinks, dedupe, parseDescription, parseTextBlock, parseTitleLine, parseYouTube, songKey } from "@/lib/parse";
import type { ExtractRequest, ExtractResponse, Song } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_URLS = 30;
const MAX_TEXT = 300_000;
const MAX_FILE_BYTES = 4_000_000;
const MAX_SEARCH = 20;
const MAX_KEYLESS_SEARCH = 40;

type Candidate = Omit<Song, "id" | "links">;

const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status });

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const started = Date.now();

  let body: ExtractRequest;
  try {
    body = (await req.json()) as ExtractRequest;
  } catch {
    return bad("リクエストの形式が正しくありません。");
  }

  const urls = (body.urls ?? []).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, MAX_URLS);
  const text = (body.text ?? "").slice(0, MAX_TEXT);
  const files = (body.files ?? []).slice(0, 10);
  const mode = body.mode ?? "fast";
  const filters = body.filters;
  if (!filters) return bad("フィルター設定がありません。");
  const totalFileBytes = files.reduce((n, f) => n + (f.data ? (f.data.length * 3) / 4 : (f.text ?? "").length), 0);
  if (totalFileBytes > MAX_FILE_BYTES) return bad("ファイルの合計サイズが大きすぎます（4MBまで）。");
  if (!urls.length && !text.trim() && !files.length) return bad("解析するURL・テキスト・ファイルのいずれかを入力してください。");

  const keys = {
    youtube: body.keys?.youtube?.trim() || process.env.YOUTUBE_API_KEY,
    gemini: body.keys?.gemini?.trim() || process.env.GEMINI_API_KEY,
    openai: body.keys?.openai?.trim() || process.env.OPENAI_API_KEY,
  };
  const hasAi = !!(keys.gemini || keys.openai);
  if (mode === "ai" && !hasAi) return bad("AI抽出モードには Gemini または OpenAI のAPIキーが必要です（設定 → APIキー）。");
  if (mode === "stats" && !keys.youtube) return bad("統計モードには YouTube Data API キーが必要です（設定 → APIキー）。");

  const signal = req.signal;
  const warnings: string[] = [];
  const candidates: Candidate[] = [];
  const material: string[] = [];
  const videoIds: string[] = [];

  // 1. URL の解析
  await Promise.all(
    urls.map(async (url) => {
      const yt = parseYouTube(url);
      if (yt.listId) {
        if (keys.youtube) {
          try {
            videoIds.push(...(await fetchPlaylistIds(yt.listId, keys.youtube, 300, signal)));
            return;
          } catch (e) {
            warnings.push(`プレイリスト取得に失敗: ${(e as Error).message}`);
          }
        }
        const ids = await fetchPlaylistIdsKeyless(yt.listId, signal);
        if (ids.length) {
          videoIds.push(...ids);
          if (!keys.youtube && ids.length >= 100) warnings.push("APIキーなしのため、プレイリストは先頭約100曲のみ取得しました。");
          return;
        }
        warnings.push("プレイリストを取得できませんでした（非公開の可能性）。YouTube APIキーを設定すると安定します。");
      }
      if (yt.videoId) {
        videoIds.push(yt.videoId);
        return;
      }
      if (/soundcloud\.com/i.test(url)) {
        const o = await oembed(url, signal);
        if (o) {
          const p = parseTitleLine(o.title, o.author);
          if (p) candidates.push({ ...p, url, source: "SoundCloud" });
          material.push(`SoundCloud: ${o.title} / ${o.author} / ${url}`);
        } else warnings.push(`SoundCloud の情報を取得できませんでした: ${url}`);
        return;
      }
      const page = await fetchPageText(url, signal);
      if (!page) {
        warnings.push(`ページを読み込めませんでした: ${url}`);
        return;
      }
      material.push(`# Webページ: ${page.title} (${url})\n${page.text}`);
      if (mode !== "ai") {
        const lines = page.text.split("\n").filter((l) => /[\/／]|feat\.?|ft\./i.test(l) && l.length < 140);
        for (const s of parseTextBlock(lines.join("\n"))) candidates.push({ ...s, source: page.title || url });
        if (hasAi) warnings.push("Webページは高速モードだと精度が低めです。「AI抽出」モードがおすすめです。");
      }
    }),
  );

  // 2. YouTube 動画情報
  const uniqIds = [...new Set(videoIds)].slice(0, 500);
  let infos: VideoInfo[] = [];
  if (uniqIds.length) {
    if (keys.youtube) {
      try {
        infos = await fetchVideos(uniqIds, keys.youtube, signal);
      } catch (e) {
        warnings.push(`YouTube API エラー: ${(e as Error).message}（キーなしの簡易取得に切り替えます）`);
      }
    }
    if (!infos.length) {
      const sliced = uniqIds.slice(0, 50);
      const res = await Promise.all(sliced.map((id) => oembed(`https://www.youtube.com/watch?v=${id}`, signal)));
      infos = res.flatMap((o, i) => (o ? [{ id: sliced[i], title: o.title, channel: o.author }] : []));
      if (uniqIds.length > 50) warnings.push("APIキーなしでは動画情報は50件までです。");
    }
    for (const v of infos) {
      const url = `https://www.youtube.com/watch?v=${v.id}`;
      const p = parseTitleLine(v.title, v.channel);
      if (p) candidates.push({ ...p, ...parseDescription(v.description), url, views: v.views, comments: v.comments, publishedAt: v.publishedAt, source: "YouTube" });
      material.push(`動画: ${v.title} / チャンネル: ${v.channel} / ${url}${v.description ? ` / 概要: ${v.description.replace(/\s+/g, " ").slice(0, 200)}` : ""}`);
    }
  }

  // 3. テキスト・ファイル
  if (text.trim()) {
    material.push(`# 貼り付けテキスト\n${text}`);
    if (mode !== "ai") for (const s of parseTextBlock(text)) candidates.push({ ...s, source: "テキスト" });
  }
  const binFiles = files.filter((f) => f.data);
  for (const f of files) {
    if (f.text) {
      material.push(`# ファイル: ${f.name}\n${f.text}`);
      if (mode !== "ai") for (const s of parseTextBlock(f.text)) candidates.push({ ...s, source: f.name });
    }
  }
  if (binFiles.length && mode !== "ai") {
    if (hasAi) warnings.push("PDF・画像の解析はAIで行いました。");
    else warnings.push("PDF・画像の解析にはAIのAPIキーが必要なため、スキップしました。");
  }

  // 4. AI 抽出（AIモード、または PDF/画像・テーマ指定がありAIキーがある場合）
  let songs: Candidate[] = candidates;
  let providerUsed: string | undefined;
  let modelUsed: string | undefined;
  const needAi = mode === "ai" || (hasAi && (binFiles.length > 0 || !!filters.theme.trim()));
  if (needAi) {
    try {
      const ai = await extractWithAi({
        provider: body.provider ?? "auto",
        geminiKey: keys.gemini,
        openaiKey: keys.openai,
        material: material.join("\n\n"),
        theme: filters.theme.trim(),
        files: binFiles,
        signal,
      });
      providerUsed = ai.provider;
      modelUsed = ai.model;
      let themeDropped = 0;
      const byKey = new Map(candidates.map((c) => [songKey(c.title), c]));
      const aiSongs: Candidate[] = [];
      for (const s of ai.songs) {
        if (filters.theme.trim() && s.matchesTheme === false) { themeDropped++; continue; }
        const k = songKey(s.title);
        const hit = byKey.get(k) ?? candidates.find((c) => { const ck = songKey(c.title); return ck.length > 1 && (ck.includes(k) || k.includes(ck)); });
        aiSongs.push({
          title: s.title,
          producer: s.producer ?? hit?.producer,
          vocal: s.vocal ?? hit?.vocal,
          bpm: s.bpm,
          key: s.key,
          mmd: s.mmd ?? "不明",
          url: hit?.url ?? s.url,
          views: hit?.views,
          comments: hit?.comments,
          publishedAt: hit?.publishedAt,
          source: hit?.source ?? "AI",
        });
      }
      songs = mode === "ai" ? aiSongs : dedupe([...aiSongs.map((s) => ({ ...s, id: "", links: { youtube: "" } })), ...candidates.map((s) => ({ ...s, id: "", links: { youtube: "" } }))]);
      if (themeDropped) warnings.push(`テーマ「${filters.theme}」に合わない ${themeDropped} 曲を除外しました。`);
    } catch (e) {
      if (mode === "ai") return bad(`AI抽出に失敗しました: ${(e as Error).message}`, 502);
      warnings.push(`AI処理に失敗したため高速モードの結果を表示します: ${(e as Error).message}`);
    }
  } else if (filters.theme.trim()) {
    warnings.push("テーマ指定はAIのAPIキーがある場合のみ有効です。");
  }

  // 5. URLのない曲（テキスト・ファイル・AI由来）をYouTubeで検索して動画URLを付ける
  //    統計モード: 公式API（再生数取得のため） / その他: キー不要の簡易検索
  {
    const useApi = mode === "stats" && !!keys.youtube;
    const limit = useApi ? MAX_SEARCH : MAX_KEYLESS_SEARCH;
    const noUrl = songs.filter((s) => !s.url);
    const missing = noUrl.slice(0, limit);
    if (noUrl.length > limit) warnings.push(`動画URLの自動検索は先頭${limit}曲までです（残りは「YouTube検索」リンクから確認できます）。`);
    for (let i = 0; i < missing.length; i += 10) {
      await Promise.all(
        missing.slice(i, i + 10).map(async (s) => {
          const q = `${s.title} ${s.producer ?? ""}`.trim();
          try {
            const id = useApi ? await searchVideo(q, keys.youtube!, signal) : await searchVideoKeyless(q, signal);
            if (id) s.url = `https://www.youtube.com/watch?v=${id}`;
          } catch (e) {
            if (!warnings.some((w) => w.startsWith("YouTube検索"))) warnings.push(`YouTube検索エラー: ${(e as Error).message}`);
          }
        }),
      );
    }
  }
  if (mode === "stats" && keys.youtube) {
    const needStats = songs.filter((s) => s.url && s.views === undefined);
    const ids = needStats.map((s) => parseYouTube(s.url!).videoId).filter((x): x is string => !!x);
    if (ids.length) {
      try {
        const stats = new Map((await fetchVideos(ids, keys.youtube, signal)).map((v) => [v.id, v]));
        for (const s of needStats) {
          const v = stats.get(parseYouTube(s.url!).videoId ?? "");
          if (v) { s.views = v.views; s.comments = v.comments; s.publishedAt = v.publishedAt; }
        }
      } catch (e) {
        warnings.push(`再生数の取得に失敗: ${(e as Error).message}`);
      }
    }
  }

  // 6. 重複統合・フィルタ・リンク生成
  const base: Song[] = dedupe(songs.map((s) => ({ ...s, id: "", links: { youtube: "" } })));
  const { kept, dropped } = applyFilters(base, filters, mode === "stats");
  const droppedText = Object.entries(dropped).map(([k, v]) => `${k}:${v}曲`).join(" / ");
  if (droppedText) warnings.push(`フィルターで除外 → ${droppedText}`);
  if (!base.length) warnings.push("楽曲を見つけられませんでした。入力内容やモードを見直してください。");

  const result: ExtractResponse = {
    songs: kept.map((s, i) => ({ ...s, id: `${Date.now().toString(36)}-${i}`, links: buildLinks(s, body.links) })),
    warnings,
    meta: { mode, provider: providerUsed, model: modelUsed, candidates: base.length, elapsedMs: Date.now() - started },
  };
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
