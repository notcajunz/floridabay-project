import { promises as dns } from "node:dns";

/**
 * The public website address and game connect address, with an automatic fallback: while the
 * configured domain does not resolve yet (DNS not pointed at this server), links use the legacy
 * address / raw IP instead, so verification and appeal links never point at a dead domain.
 */
const trim = (value) => String(value || "").replace(/\/$/, "");
const state = { site: null, connect: null };

const resolves = (hostname) => dns.lookup(hostname).then(() => true, () => false);

export async function refreshSiteUrls() {
  const site = trim(process.env.FBRP_PUBLIC_URL);
  const legacy = trim(process.env.FBRP_LEGACY_URL);
  if (site) {
    const host = new URL(site).hostname;
    state.site = legacy && !["localhost", "127.0.0.1"].includes(host) && !(await resolves(host)) ? legacy : site;
  }
  const connect = String(process.env.FBRP_CONNECT_URL || "");
  const fallback = String(process.env.FBRP_CONNECT_FALLBACK || "");
  if (connect) {
    const host = connect.replace(/^fivem:\/\/connect\//, "").split(":")[0];
    state.connect = fallback && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && !(await resolves(host)) ? fallback : connect;
  }
  return { ...state };
}

/** Website base URL without a trailing slash. */
export const publicBase = () => state.site || trim(process.env.FBRP_PUBLIC_URL);
/** fivem://connect/... address for the Play button. */
export const connectUrl = () => state.connect || String(process.env.FBRP_CONNECT_URL || "");
