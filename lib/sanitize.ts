// 外部から来たデータ（API リクエスト・共有リンク・バックアップ）を型どおりの安全な値に直す。サーバー/ブラウザ両対応。
import { DEFAULT_FILTERS, DEFAULT_LINKS, type ApiKeys, type ExtractRequest, type Filters, type LinkOptions, type Mode, type Provider, type UploadFile } from "./types";

export const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);
const count = (v: unknown): number | "" => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e12) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const asMode = (v: unknown): Mode => (v === "ai" || v === "stats" ? v : "fast");
export const asProvider = (v: unknown): Provider => (v === "gemini" || v === "openai" ? v : "auto");

export function sanitizeFilters(raw: unknown): Filters {
  const f = obj(raw);
  return {
    ...DEFAULT_FILTERS,
    minViews: count(f.minViews),
    maxViews: count(f.maxViews),
    minComments: count(f.minComments),
    maxComments: count(f.maxComments),
    excludeWords: str(f.excludeWords, 500),
    vocal: str(f.vocal, 200),
    producer: str(f.producer, 200),
    bpm: typeof f.bpm === "number" && f.bpm > 0 && f.bpm < 1000 ? Math.round(f.bpm) : "",
    key: str(f.key, 20),
    theme: str(f.theme, 200),
    multiOnly: bool(f.multiOnly),
    requireMmd: bool(f.requireMmd),
  };
}

export function sanitizeLinks(raw: unknown): LinkOptions {
  const l = obj(raw);
  return { lyrics: bool(l.lyrics, DEFAULT_LINKS.lyrics), analysis: bool(l.analysis, DEFAULT_LINKS.analysis), tunebat: bool(l.tunebat, DEFAULT_LINKS.tunebat) };
}

const FILE_MIME = /^(application\/pdf|image\/(png|jpeg|webp|gif|heic|heif)|text\/[\w.+-]+)$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
// API キーに使われる文字だけ許可（ヘッダー・URL への混入を防ぐ）
const KEY_RE = /^[\w.\-~]{10,200}$/;

function sanitizeFile(raw: unknown): UploadFile | null {
  const f = obj(raw);
  const mime = str(f.mime, 100).toLowerCase();
  const data = typeof f.data === "string" && BASE64.test(f.data) ? f.data : undefined;
  const text = typeof f.text === "string" ? f.text.slice(0, 2_000_000) : undefined;
  if (!data && !text) return null;
  if (data && !FILE_MIME.test(mime)) return null;
  return { name: str(f.name, 200) || "file", mime: mime || "text/plain", data, text: data ? undefined : text, size: typeof f.size === "number" ? f.size : 0 };
}

function sanitizeKeys(raw: unknown): ApiKeys {
  const k = obj(raw);
  const key = (v: unknown) => (typeof v === "string" && KEY_RE.test(v.trim()) ? v.trim() : undefined);
  return { youtube: key(k.youtube), gemini: key(k.gemini), openai: key(k.openai) };
}

/** /api/extract のリクエスト本文を検証・正規化 */
export function sanitizeExtractRequest(raw: unknown, limits: { maxUrls: number; maxText: number; maxFiles: number }): ExtractRequest {
  const b = obj(raw);
  const urls = (Array.isArray(b.urls) ? b.urls : [])
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim().slice(0, 2000))
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, limits.maxUrls);
  const files = (Array.isArray(b.files) ? b.files : []).slice(0, limits.maxFiles).map(sanitizeFile).filter((f): f is UploadFile => !!f);
  return {
    urls,
    text: str(b.text, limits.maxText),
    files,
    mode: asMode(b.mode),
    provider: asProvider(b.provider),
    filters: sanitizeFilters(b.filters),
    links: sanitizeLinks(b.links),
    keys: sanitizeKeys(b.keys),
  };
}
