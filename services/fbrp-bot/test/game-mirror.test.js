import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { devGameTarget, mirrorToDev } from "../src/game-mirror.js";

function devServer(status = 200) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      calls.push({ url: req.url, method: req.method, auth: req.headers.authorization, body: raw });
      res.writeHead(status).end("{}");
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, calls, origin: `http://127.0.0.1:${server.address().port}/fbrp_core` })));
}

test("no dev origin means nothing is mirrored", async () => {
  assert.equal(devGameTarget({}), null);
  assert.equal(await mirrorToDev("/refresh", {}, "POST", { env: {} }), false);
});

test("POST actions reach the dev server with the dev token, falling back to the live token", async () => {
  const dev = await devServer();
  try {
    const env = { FBRP_DEV_FIVEM_ORIGIN: dev.origin + "/", FBRP_DEV_SERVICE_TOKEN: "dev-token", FBRP_SERVICE_TOKEN: "live-token" };
    assert.equal(await mirrorToDev("/ops/action", { action: "x" }, "POST", { env }), true);
    assert.equal(dev.calls[0].url, "/fbrp_core/ops/action");
    assert.equal(dev.calls[0].auth, "Bearer dev-token");
    assert.deepEqual(JSON.parse(dev.calls[0].body), { action: "x" });
    delete env.FBRP_DEV_SERVICE_TOKEN;
    await mirrorToDev("/refresh", {}, "POST", { env });
    assert.equal(dev.calls[1].auth, "Bearer live-token");
  } finally {
    dev.server.close();
  }
});

test("read-only GET requests are not mirrored", async () => {
  const dev = await devServer();
  try {
    assert.equal(await mirrorToDev("/ops", {}, "GET", { env: { FBRP_DEV_FIVEM_ORIGIN: dev.origin } }), false);
    assert.equal(dev.calls.length, 0);
  } finally {
    dev.server.close();
  }
});

test("a failing or unreachable dev server never throws", async () => {
  const logs = [];
  const log = (line) => logs.push(line);
  const bad = await devServer(500);
  try {
    assert.equal(await mirrorToDev("/refresh", {}, "POST", { env: { FBRP_DEV_FIVEM_ORIGIN: bad.origin }, log }), false);
  } finally {
    bad.server.close();
  }
  assert.equal(await mirrorToDev("/refresh", {}, "POST", { env: { FBRP_DEV_FIVEM_ORIGIN: "http://127.0.0.1:9/x" }, log }), false);
  assert.equal(logs.length, 2);
});
