// 利用者が入力した URL を安全に取得する（SSRF 対策）。
// - http/https・標準ポートのみ、URL 内の認証情報は拒否
// - 接続する瞬間に名前解決結果を検査する（DNS リバインディング対策）。
//   「検査してから fetch で再解決」だと検査後に別 IP へ差し替えられるため、node:http(s) の lookup フックで
//   実際に接続する IP をその場で検査し、ブロック対象なら接続しない。
// - リダイレクトは自前で辿り、毎回同じ検査をやり直す
// - タイムアウト・受信サイズ・圧縮展開後サイズの上限（zip bomb 対策）
import { lookup as dnsLookup } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";
import zlib from "node:zlib";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;

// 取得を拒否するアドレス帯（プライベート・ループバック・リンクローカル・予約・マルチキャスト・移行用トンネル等）
const blocked = new BlockList();
for (const [base, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as [string, number][]) blocked.addSubnet(base, bits, "ipv4");
for (const [base, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as [string, number][]) blocked.addSubnet(base, bits, "ipv6");

export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 0) return true;
  if (v === 6) {
    // IPv4 射影アドレス（::ffff:a.b.c.d / ::ffff:aabb:ccdd）は中身の IPv4 で判定
    const m = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return blocked.check(m[1], "ipv4");
    if (/^::ffff:/i.test(ip)) return true;
  }
  return blocked.check(ip, v === 4 ? "ipv4" : "ipv6");
}

/** URL の事前検査（形式・ポート・明らかな内部ホスト名）。実際の接続先 IP は接続時にも検査する */
export function assertPublicUrl(u: URL): void {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("http/https 以外の URL は取得できません");
  if (u.username || u.password) throw new Error("認証情報を含む URL は取得できません");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("標準以外のポートは取得できません");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || /(^|\.)(localhost|local|internal|home|lan|intranet)$/i.test(host)) throw new Error("内部向けのホストは取得できません");
  if (isIP(host) && isBlockedAddress(host)) throw new Error("内部ネットワークのアドレスは取得できません");
}

/** 接続時に呼ばれる名前解決。ブロック対象の IP が1つでも含まれていれば接続しない */
const guardedLookup = ((hostname: string, options: unknown, cb: (...a: unknown[]) => void) => {
  const opts = (typeof options === "object" && options ? options : {}) as { all?: boolean; family?: number };
  dnsLookup(hostname, { all: true, family: opts.family, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) return cb(new Error("内部ネットワークのアドレスは取得できません"));
    if (opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}) as unknown as typeof dnsLookup;

type RawResponse = { status: number; headers: IncomingMessage["headers"]; stream: Readable };

function request(u: URL, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      {
        method: "GET",
        lookup: guardedLookup,
        agent: false,
        headers: {
          "User-Agent": "Mozilla/5.0 (music-extractor)",
          "Accept-Language": "ja",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, stream: res }),
    );
    const abort = () => req.destroy(new Error("aborted"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    req.on("error", reject);
    req.end();
  });
}

/** 受信サイズ（圧縮展開後）を制限しながら本文を読む */
async function readLimited(res: RawResponse, maxBytes: number): Promise<string> {
  const enc = String(res.headers["content-encoding"] ?? "identity").toLowerCase().trim();
  let src: Readable = res.stream;
  if (enc === "gzip" || enc === "x-gzip") src = res.stream.pipe(zlib.createGunzip());
  else if (enc === "deflate") src = res.stream.pipe(zlib.createInflate());
  else if (enc === "br") src = res.stream.pipe(zlib.createBrotliDecompress());
  else if (enc !== "identity" && enc !== "") {
    res.stream.destroy();
    return "";
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of src) {
      const buf = chunk as Buffer;
      total += buf.length;
      if (total > maxBytes) {
        chunks.push(buf.subarray(0, buf.length - (total - maxBytes)));
        break;
      }
      chunks.push(buf);
    }
  } finally {
    src.destroy();
    res.stream.destroy();
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** 公開 Web ページを安全に取得。HTML 以外・失敗時は null */
export async function safeFetchHtml(url: string, signal?: AbortSignal, maxBytes = 2_000_000): Promise<{ html: string; finalUrl: string } | null> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertPublicUrl(current);
    const res = await request(current, sig);
    if (res.status >= 300 && res.status < 400) {
      res.stream.destroy();
      const loc = res.headers.location;
      if (!loc) return null;
      current = new URL(loc, current);
      continue;
    }
    if (res.status < 200 || res.status >= 300 || !String(res.headers["content-type"] ?? "").includes("html")) {
      res.stream.destroy();
      return null;
    }
    return { html: await readLimited(res, maxBytes), finalUrl: current.toString() };
  }
  return null;
}
