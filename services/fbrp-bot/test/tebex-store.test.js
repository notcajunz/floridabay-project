import test from "node:test";
import assert from "node:assert/strict";
import { createTebexStore, TebexStoreError } from "../src/tebex-store.js";

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test("catalog is sourced from Tebex with packages and optional basket pricing", async () => {
  const calls = [];
  const store = createTebexStore({ token: "public-token", fetchImpl: async (url) => {
    calls.push(url);
    if (url.endsWith("/sidebar")) return response({ data: [] });
    if (url.includes("/categories")) return response({ data: [{ id: 1, packages: [{ ident: "pkg_1_7" }] }] });
    return response({ data: { name: "Florida Bay" } });
  } });
  const result = await store.catalog("basket-123");
  assert.equal(result.store.name, "Florida Bay");
  assert.equal(result.categories[0].packages[0].ident, "pkg_1_7");
  assert.ok(calls.some((url) => url.includes("includePackages=1&basketIdent=basket-123")));
});

test("basket creation pins Tebex return paths to the supplied HTTPS store", async () => {
  let request;
  const store = createTebexStore({ token: "public-token", fetchImpl: async (url, options) => {
    request = { url, options };
    return response({ data: { ident: "basket-123" } });
  } });
  await store.createBasket("https://store.floridabay.net/");
  const body = JSON.parse(request.options.body);
  assert.equal(body.complete_url, "https://store.floridabay.net/?checkout=complete");
  assert.equal(body.cancel_url, "https://store.floridabay.net/?checkout=cancelled");
  assert.equal(body.complete_auto_redirect, true);
});

test("package operations preserve Tebex opaque identifiers", async () => {
  let request;
  const store = createTebexStore({ token: "public-token", fetchImpl: async (url, options) => {
    request = { url, options };
    return response({ data: { ident: "basket-123" } });
  } });
  await store.addPackage("basket-123", "ext_10_asset%2Fabc", 2, true);
  assert.equal(request.url, "https://headless.tebex.io/api/baskets/basket-123/packages");
  assert.deepEqual(JSON.parse(request.options.body), { package_id: "ext_10_asset%2Fabc", quantity: 2, dynamic: true });
});

test("upstream failures become safe storefront errors", async () => {
  const store = createTebexStore({ token: "public-token", fetchImpl: async () => response({ detail: "Package is no longer available." }, 422) });
  await assert.rejects(store.catalog(), (error) => error instanceof TebexStoreError && error.status === 422 && /no longer available/.test(error.message));
});

test("an absent token exposes configuration state without contacting Tebex", async () => {
  const store = createTebexStore({ token: "", fetchImpl: async () => assert.fail("fetch should not run") });
  assert.equal(store.configured, false);
  await assert.rejects(store.catalog(), (error) => error.status === 503 && /public token/.test(error.message));
});
