export function devGameTarget(env = process.env) {
  const base = String(env.FBRP_DEV_FIVEM_ORIGIN || "").trim().replace(/\/$/, "");
  if (!base) return null;
  return { base, token: String(env.FBRP_DEV_SERVICE_TOKEN || env.FBRP_SERVICE_TOKEN || "") };
}

export function mirrorToDev(path, body, method = "POST", { env = process.env, fetchImpl = fetch, log = console.warn } = {}) {
  const target = devGameTarget(env);
  if (!target || method === "GET") return Promise.resolve(false);
  return Promise.resolve()
    .then(() =>
      fetchImpl(`${target.base}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.token}` },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(3500),
      }),
    )
    .then((response) => {
      if (!response.ok) log(`Dev FiveM mirror ${path} returned ${response.status}`);
      return response.ok;
    })
    .catch((error) => {
      log(`Dev FiveM mirror ${path} failed: ${error.message}`);
      return false;
    });
}
