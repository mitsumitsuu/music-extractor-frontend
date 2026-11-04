import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBlockedAddress } from "@/lib/server/safe-fetch";

describe("isBlockedAddress（SSRF 対策）", () => {
  it.each([
    "127.0.0.1", "127.255.255.255", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fd00::1", "fc00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::1", "2001:db8::1",
  ])("内部・特殊アドレス %s は拒否", (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "142.250.196.110", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"])("公開アドレス %s は許可", (ip) => expect(isBlockedAddress(ip)).toBe(false));
  it("IP として解釈できない文字列は拒否（安全側）", () => {
    for (const s of ["", "example.com", "127.1", "0x7f.0.0.1", "2130706433"]) expect(isBlockedAddress(s)).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  // 同期・非同期どちらの実装でも同じ検査ができるよう async 関数で包む
  const check = async (url: string) => { await assertPublicUrl(new URL(url)); };
  const rejects = async (url: string) => { await expect(check(url)).rejects.toThrow(); };
  it("http/https 以外・認証情報・標準外ポート・内部ホスト名を拒否", async () => {
    for (const u of [
      "file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "http://user:pw@8.8.8.8/", "http://8.8.8.8:8080/", "http://8.8.8.8:22/",
      "http://localhost/", "http://foo.localhost/", "http://printer.local/", "http://db.internal/", "http://router.home/", "http://nas.lan/",
      "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://2130706433/", "http://0x7f.1/", "http://[::ffff:127.0.0.1]/",
    ]) await rejects(u);
  });
  it("公開 IP リテラル（80/443）は通る", async () => {
    await expect(check("http://8.8.8.8/")).resolves.toBeUndefined();
    await expect(check("https://8.8.8.8:443/x")).resolves.toBeUndefined();
    await expect(check("https://[2606:4700:4700::1111]/")).resolves.toBeUndefined();
  });
});
