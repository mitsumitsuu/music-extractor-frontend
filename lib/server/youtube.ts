// YouTube / SoundCloud / 一般Webページからの情報取得（サーバー専用）

const YT = "https://www.googleapis.com/youtube/v3";

export type VideoInfo = {
  id: string;
  title: string;
  channel: string;
  views?: number;
  comments?: number;
  publishedAt?: string;
  description?: string;
};

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { "Accept-Language": "ja" } });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) msg += ` ${j.error.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

type VideosResp = {
  items?: {
    id: string;
    snippet?: { title?: string; channelTitle?: string; publishedAt?: string; description?: string };
    statistics?: { viewCount?: string; commentCount?: string };
  }[];
};

export async function fetchVideos(ids: string[], key: string, signal?: AbortSignal): Promise<VideoInfo[]> {
  const out: VideoInfo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const j = await getJson<VideosResp>(`${YT}/videos?part=snippet,statistics&hl=ja&id=${chunk.join(",")}&key=${encodeURIComponent(key)}`, signal);
    for (const it of j.items ?? []) {
      out.push({
        id: it.id,
        title: it.snippet?.title ?? "",
        channel: it.snippet?.channelTitle ?? "",
        publishedAt: it.snippet?.publishedAt,
        description: it.snippet?.description?.slice(0, 600),
        views: it.statistics?.viewCount ? Number(it.statistics.viewCount) : undefined,
        comments: it.statistics?.commentCount ? Number(it.statistics.commentCount) : undefined,
      });
    }
  }
  return out;
}

type PlaylistResp = { nextPageToken?: string; items?: { contentDetails?: { videoId?: string } }[] };

/** プレイリストの動画IDを最大 maxItems 件取得 */
export async function fetchPlaylistIds(listId: string, key: string, maxItems = 300, signal?: AbortSignal): Promise<string[]> {
  const ids: string[] = [];
  let token = "";
  while (ids.length < maxItems) {
    const j = await getJson<PlaylistResp>(
      `${YT}/playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(listId)}&key=${encodeURIComponent(key)}${token ? `&pageToken=${token}` : ""}`,
      signal,
    );
    for (const it of j.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  return ids.slice(0, maxItems);
}

type SearchResp = { items?: { id?: { videoId?: string } }[] };

/** 曲名からYouTube動画を1件検索（100クォータ消費するので件数を絞って使う） */
export async function searchVideo(q: string, key: string, signal?: AbortSignal): Promise<string | undefined> {
  const j = await getJson<SearchResp>(
    `${YT}/search?part=id&type=video&maxResults=1&regionCode=JP&relevanceLanguage=ja&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`,
    signal,
  );
  return j.items?.[0]?.id?.videoId;
}

/** APIキーなしで動画タイトルを取る（oEmbed） */
export async function oembed(url: string, signal?: AbortSignal): Promise<{ title: string; author: string } | null> {
  const isSc = /soundcloud\.com/.test(url);
  const endpoint = isSc
    ? `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
    : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  try {
    const j = await getJson<{ title?: string; author_name?: string }>(endpoint, signal);
    return j.title ? { title: j.title, author: j.author_name ?? "" } : null;
  } catch {
    return null;
  }
}

/** 一般ページ（ランキングサイト等）の本文テキストを取得 */
export async function fetchPageText(url: string, signal?: AbortSignal): Promise<{ title: string; text: string } | null> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    // SSRF 対策: ローカル/プライベートアドレスは拒否
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?)/.test(u.hostname)) return null;
    const res = await fetch(u, { signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (music-extractor)", "Accept-Language": "ja" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 2_000_000);
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
    const text = html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    return { title, text: text.slice(0, 60_000) };
  } catch {
    return null;
  }
}

const YT_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", "Accept-Language": "ja-JP,ja;q=0.9" };

/** APIキーなしでYouTube検索の先頭動画IDを取得（旧バックエンドの yt-dlp ytsearch1 相当） */
export async function searchVideoKeyless(q: string, signal?: AbortSignal): Promise<string | undefined> {
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`, { signal, headers: YT_HEADERS });
    if (!res.ok) return undefined;
    const html = await res.text();
    return html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/)?.[1] ?? html.match(/"videoId":"([\w-]{11})"/)?.[1];
  } catch {
    return undefined;
  }
}

/** APIキーなしでプレイリストの動画IDを取得（先頭100件程度まで） */
export async function fetchPlaylistIdsKeyless(listId: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`, { signal, headers: YT_HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    const ids: string[] = [];
    for (const m of html.matchAll(/"playlistVideoRenderer":\{"videoId":"([\w-]{11})"/g)) if (!ids.includes(m[1])) ids.push(m[1]);
    return ids;
  } catch {
    return [];
  }
}
