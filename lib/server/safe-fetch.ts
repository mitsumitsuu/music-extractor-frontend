// 利用者が入力した URL を安全に取得する（SSRF 対策）。
// - http/https・標準ポートのみ、URL 内の認証情報は拒否
// - 名前解決した全アドレスがグローバル IP であることを確認（プライベート/ループバック/リンクローカル等を拒否）
// - リダイレクトは自前で辿り、毎回同じ検査をやり直す
// - タイムアウトと受信サイズの上限
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function isBlockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => (n & (~0 << (32 - bits))) >>> 0 === v4ToInt(base));
}

function isBlockedV6(ip: string): boolean {
  const s = ip.toLowerCase();
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  if (s === "::" || s === "::1") return true;
  // fc00::/7（ユニークローカル）、fe80::/10（リンクローカル）、ff00::/8（マルチキャスト）、64:ff9b::/96（NAT64）、2001:db8::/32（文書用）
  return /^(f[cd]|fe[89ab]|ff)/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8:") || s.startsWith("::ffff:");
}

export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedV4(ip);
  if (v === 6) return isBlockedV6(ip);
  return true;
}

/** 取得してよい公開 URL か検査する。問題があれば例外 */
export async function assertPublicUrl(u: URL): Promise<void> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("http/https 以外の URL は取得できません");
  if (u.username || u.password) throw new Error("認証情報を含む URL は取得できません");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("標準以外のポートは取得できません");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || /(^|\.)(localhost|local|internal|home|lan|intranet)$/i.test(host)) throw new Error("内部向けのホストは取得できません");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) throw new Error("内部ネットワークのアドレスは取得できません");
}

/** 受信サイズを制限しながら本文を読む */
async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)));
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** 公開 Web ページを安全に取得。HTML 以外・失敗時は null */
export async function safeFetchHtml(url: string, signal?: AbortSignal, maxBytes = 2_000_000): Promise<{ html: string; finalUrl: string } | null> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      signal: sig,
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (music-extractor)", "Accept-Language": "ja", Accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) return null;
      current = new URL(loc, current);
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
      await res.body?.cancel();
      return null;
    }
    return { html: await readLimited(res, maxBytes), finalUrl: current.toString() };
  }
  return null;
}
