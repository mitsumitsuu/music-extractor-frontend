import { buildLinks, normalize } from "./parse";
import type { Song } from "./types";

export type SongEditDraft = {
  title: string;
  producer: string;
  vocal: string;
  bpm: string;
  key: string;
  mmd: Song["mmd"] | "";
  url: string;
};

export type SongEditResult = { ok: true; song: Song } | { ok: false; error: string };

function youtubeHost(url: URL): string | undefined {
  const host = url.hostname.replace(/^(?:www\.|m\.|music\.)/, "");
  return host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com" ? host : undefined;
}

function youtubeVideoId(url: URL): string | undefined {
  const host = youtubeHost(url);
  if (!host) return undefined;
  if (host === "youtu.be") return url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1];
  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v");
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  }
  return url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})\/?$/)?.[1];
}

function videoId(url?: string): string | undefined {
  if (!url) return undefined;
  try { return youtubeVideoId(new URL(url)); } catch { return undefined; }
}

/** 下書きを検証し、元の楽曲を変更せずにリンクも更新する。 */
export function applySongEdit(original: Song, draft: SongEditDraft): SongEditResult {
  const title = draft.title.trim();
  if (!title) return { ok: false, error: "曲名を入力してください。" };

  const bpmText = normalize(draft.bpm);
  const bpm = bpmText ? Number(bpmText) : undefined;
  if (bpmText && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(bpmText) || bpm === undefined || !Number.isFinite(bpm) || bpm <= 0 || bpm > 999)) {
    return { ok: false, error: "BPMは0より大きい999以下の数値を入力してください（小数も使えます）。" };
  }

  let url: string | undefined;
  if (draft.url.trim()) {
    try {
      const rawUrl = draft.url.trim();
      if (!/^https?:\/\//i.test(rawUrl)) throw new Error("invalid URL");
      const parsed = new URL(rawUrl);
      if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error("invalid URL");
      if (youtubeHost(parsed) && !youtubeVideoId(parsed)) {
        return { ok: false, error: "YouTubeは動画ページのURLを入力してください（検索ページ・プレイリストURLは使えません）。" };
      }
      url = parsed.href;
    } catch {
      return { ok: false, error: "URLはhttps://またはhttp://で始まる楽曲・動画ページを入力してください。" };
    }
  }

  const oldId = videoId(original.url);
  const newId = videoId(url);
  let originalUrl = original.url?.trim() || undefined;
  try { if (originalUrl) originalUrl = new URL(originalUrl).href; } catch { /* 比較は元の文字列で行う */ }
  const urlChanged = originalUrl !== url && !(oldId && oldId === newId);
  const song: Song = {
    ...original,
    title,
    producer: draft.producer.trim() || undefined,
    vocal: draft.vocal.trim() || undefined,
    bpm,
    key: draft.key.trim() || undefined,
    mmd: draft.mmd || undefined,
    url,
    ...(urlChanged ? { views: undefined, comments: undefined, publishedAt: undefined } : {}),
  };
  song.links = buildLinks(song, {
    lyrics: !!original.links.lyrics,
    analysis: !!original.links.analysis,
    tunebat: !!original.links.tunebat,
  });
  return { ok: true, song };
}
