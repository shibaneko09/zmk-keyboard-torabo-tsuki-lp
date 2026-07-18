import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the torabo-tsuki XS editor shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>torabo-tsuki XS Keymap Editor<\/title>/i);
  assert.match(html, /torabo-tsuki/);
  assert.match(html, /Keymap Editor/);
  assert.match(html, /USBで接続/);
  assert.match(html, /レイヤーを追加/);
  assert.match(html, /残り 4/);
  assert.match(html, /キーコードのカテゴリ/);
  assert.match(html, /同時押し/);
  assert.match(html, /Shift/);
  assert.match(html, /Letters/);
  assert.match(html, /Function/);
  assert.match(html, /XS \/ S Layout/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});
