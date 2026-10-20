const TEBEX_ORIGIN = "https://headless.tebex.io";
const MAX_IDENT_LENGTH = 512;

export class TebexStoreError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "TebexStoreError";
    this.status = status;
  }
}

function required(value, label, max = MAX_IDENT_LENGTH) {
  const clean = String(value || "").trim();
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f]/.test(clean))
    throw new TebexStoreError(`${label} is invalid.`, 400);
  return clean;
}

function quantity(value) {
  const clean = Number(value);
  if (!Number.isSafeInteger(clean) || clean < 1 || clean > 100)
    throw new TebexStoreError("Quantity must be between 1 and 100.", 400);
  return clean;
}

function apiMessage(body, fallback) {
  if (!body || typeof body !== "object") return fallback;
  return String(body.detail || body.message || body.error || body.title || fallback).slice(0, 300);
}

/**
 * Thin, testable adapter for Tebex Headless API v2.1. Tebex owns all prices, taxes,
 * package rules and checkout; the website never duplicates commerce state.
 */
export function createTebexStore({ token = process.env.TEBEX_PUBLIC_TOKEN, fetchImpl = globalThis.fetch } = {}) {
  const publicToken = String(token || "").trim();
  const configured = publicToken.length >= 8;
  const accountRoot = `${TEBEX_ORIGIN}/api/accounts/${encodeURIComponent(publicToken)}`;

  async function request(url, { method = "GET", body } = {}) {
    if (!configured)
      throw new TebexStoreError("The Florida Bay store is waiting for its Tebex public token.", 503);
    let result;
    try {
      result = await fetchImpl(url, {
        method,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new TebexStoreError("Tebex is temporarily unavailable. Please try again in a moment.", 502);
    }
    const payload = result.status === 204 ? null : await result.json().catch(() => null);
    if (!result.ok)
      throw new TebexStoreError(apiMessage(payload, "Tebex could not complete that request."), result.status >= 500 ? 502 : result.status);
    return payload?.data ?? payload;
  }

  const account = (pathname, options) => request(`${accountRoot}${pathname}`, options);
  const basket = (ident, pathname = "", options) =>
    request(`${TEBEX_ORIGIN}/api/baskets/${encodeURIComponent(required(ident, "Basket"))}${pathname}`, options);

  return {
    configured,

    async catalog(basketIdent = "") {
      const suffix = basketIdent
        ? `?includePackages=1&basketIdent=${encodeURIComponent(required(basketIdent, "Basket"))}`
        : "?includePackages=1";
      const [store, categories, sidebar] = await Promise.all([
        account(""),
        account(`/categories${suffix}`),
        account("/sidebar").catch(() => []),
      ]);
      return { configured: true, store, categories: Array.isArray(categories) ? categories : [], sidebar: Array.isArray(sidebar) ? sidebar : [] };
    },

    getBasket(ident) {
      return account(`/baskets/${encodeURIComponent(required(ident, "Basket"))}`);
    },

    createBasket(returnUrl, custom = {}) {
      const url = new URL(required(returnUrl, "Store URL", 2048));
      if (url.protocol !== "https:" && url.hostname !== "localhost")
        throw new TebexStoreError("Store URL must use HTTPS.", 400);
      const base = `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
      return account("/baskets", {
        method: "POST",
        body: {
          complete_url: `${base}${base.includes("?") ? "&" : "?"}checkout=complete`,
          cancel_url: `${base}${base.includes("?") ? "&" : "?"}checkout=cancelled`,
          complete_auto_redirect: true,
          custom: { storefront: "florida-bay", ...custom },
        },
      });
    },

    auth(ident, returnUrl) {
      const url = new URL(required(returnUrl, "Return URL", 2048));
      if (url.protocol !== "https:" && url.hostname !== "localhost")
        throw new TebexStoreError("Return URL must use HTTPS.", 400);
      return account(`/baskets/${encodeURIComponent(required(ident, "Basket"))}/auth?returnUrl=${encodeURIComponent(url.toString())}`);
    },

    addPackage(ident, packageId, amount = 1, dynamic = false) {
      return basket(ident, "/packages", {
        method: "POST",
        body: { package_id: required(packageId, "Package"), quantity: quantity(amount), ...(dynamic ? { dynamic: true } : {}) },
      });
    },

    removePackage(ident, packageId) {
      return basket(ident, "/packages/remove", {
        method: "POST",
        body: { package_id: required(packageId, "Package") },
      });
    },

    async updateQuantity(ident, packageId, amount) {
      await basket(ident, `/packages/${encodeURIComponent(required(packageId, "Package"))}`, {
        method: "PUT",
        body: { quantity: quantity(amount) },
      });
      return this.getBasket(ident);
    },

    async promotion(ident, type, code, remove = false) {
      const specs = {
        coupon: ["coupons", "coupon_code"],
        creator: ["creator-codes", "creator_code"],
        giftcard: ["giftcards", "card_number"],
      };
      const spec = specs[String(type)];
      if (!spec) throw new TebexStoreError("Choose a valid code type.", 400);
      const value = required(code, "Code", 120);
      await account(`/baskets/${encodeURIComponent(required(ident, "Basket"))}/${spec[0]}${remove ? "/remove" : ""}`, {
        method: "POST",
        body: { [spec[1]]: value },
      });
      return this.getBasket(ident);
    },
  };
}
