import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchHtml = vi.fn();
vi.mock("@/lib/server/safe-fetch", () => ({ safeFetchHtml: (...a: unknown[]) => safeFetchHtml(...a) }));

import { decodeEntities, fetchPageText } from "@/lib/server/youtube";

beforeEach(() => { safeFetchHtml.mockReset(); });

describe("fetchPageText（ランキングページ等の本文抽出）", () => {
  it("script/style を除き、タグを外して行ごとに整形、HTML エンティティを戻す", async () => {
    safeFetchHtml.mockResolvedValue({
      finalUrl: "https://example.com/",
      html: "<html><head><title> ランキング </title><style>.a{}</style></head><body><script>var x=1</script><ol><li>1位 千本桜 &amp; ロキ</li><li>2位&nbsp;&lt;メルト&gt;</li></ol><p>a<br>b</p></body></html>",
    });
    const r = await fetchPageText("https://example.com/");
    expect(r?.title).toBe("ランキング");
    expect(r?.text.split("\n")).toEqual(["1位 千本桜 & ロキ", "2位 <メルト>", "a", "b"]);
    expect(r?.text).not.toContain("var x");
  });
  it("HTML コメント・<head>・数値文字参照を処理", async () => {
    safeFetchHtml.mockResolvedValue({ finalUrl: "", html: "<head><title>T</title></head><body><!-- <li>隠し</li> --><li>&#x5343;&#26412;&#26716;</li><li>&amp;lt; はそのまま</li></body>" });
    expect((await fetchPageText("https://example.com/"))?.text).toBe("千本桜\n&lt; はそのまま");
  });
  it("取得できなかったとき・例外のときは null", async () => {
    safeFetchHtml.mockResolvedValue(null);
    expect(await fetchPageText("https://example.com/")).toBeNull();
    safeFetchHtml.mockImplementation(async () => { throw new Error("内部ネットワークのアドレスは取得できません"); });
    expect(await fetchPageText("http://127.0.0.1/")).toBeNull();
  });
  it("巨大なページは本文 60,000 文字まで", async () => {
    safeFetchHtml.mockResolvedValue({ finalUrl: "", html: "<p>" + "あ".repeat(200_000) + "</p>" });
    expect((await fetchPageText("https://example.com/"))?.text).toHaveLength(60_000);
  });
});

describe("decodeEntities", () => {
  it("名前付き・10進・16進。不正な番号や未知の名前はそのまま", () => {
    expect(decodeEntities("&lt;a&gt; &quot;x&quot; &apos; &nbsp;|&#12354;&#x3042;")).toBe('<a> "x" \'  |ああ');
    expect(decodeEntities("&#0; &#xD800; &#99999999; &unknown;")).toBe("&#0; &#xD800; &#99999999; &unknown;");
  });
});
