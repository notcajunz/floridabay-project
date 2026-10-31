// Keeps the "FBRP | In-Game Staff Permissions" Google Sheet in step with the game. fbrp_core builds a
// rank-by-permission matrix from the live ACE tables (GET /staff-permissions); this module polls it
// and rewrites the sheet whenever it changes, so edits made by the bot, the website, a migration or a
// release all show up on their own. Every grant or revoke is also appended to the Changes tab.

import { createHash, createSign } from "node:crypto";
import { readFileSync } from "node:fs";

export const DEFAULT_SPREADSHEET_ID = "10qnS9yY4VTu7r2wW4QgLZVMNzkayBeMIKo58v3fNbOw";
export const PERMISSIONS_TAB = "Permissions";
export const CHANGES_TAB = "Changes";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const HEADER_ROWS = 4;
const FIXED_COLUMNS = 2;
const EASTERN = "America/New_York";

const b64url = (input) => Buffer.from(input).toString("base64url");

export function easternStamp(date = new Date()) {
  return `${date.toLocaleString("en-US", { timeZone: EASTERN, dateStyle: "medium", timeStyle: "short" })} ET`;
}

export function columnLetter(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Stable fingerprint of what the sheet shows, ignoring when the matrix was generated. */
export function matrixHash(matrix) {
  return createHash("sha256").update(JSON.stringify({ ranks: matrix.ranks, sections: matrix.sections })).digest("hex");
}

/**
 * The Permissions tab as a grid of cell values plus where its structure sits, so the formatting
 * requests can follow it.
 */
export function buildPermissionsGrid(matrix, updatedLabel) {
  const ranks = matrix.ranks || [];
  const width = FIXED_COLUMNS + ranks.length;
  const pad = (row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")];
  const grid = [];
  grid.push(pad(["FBRP | In-Game Staff Permissions"]));
  grid.push(pad([`Read live from the game's permission tables: every EasyAdmin, FBRP and legacy vMenu permission and which ranks use it. Updates by itself within a minute of any change made by the bot, the website or a release. Last updated ${updatedLabel}.`]));
  const teams = [];
  grid.push(pad(["", "", ...ranks.map((rank) => rank.team)]));
  ranks.forEach((rank, index) => {
    const last = teams[teams.length - 1];
    if (last && last.name === rank.team) last.end = FIXED_COLUMNS + index + 1;
    else teams.push({ name: rank.team, start: FIXED_COLUMNS + index, end: FIXED_COLUMNS + index + 1 });
  });
  grid.push(pad(["Permission", "Permission ID", ...ranks.map((rank) => rank.label)]));
  const sectionRows = [];
  for (const section of matrix.sections || []) {
    sectionRows.push(grid.length);
    grid.push(pad([`${section.source}: ${section.title}`]));
    for (const row of section.rows || []) {
      const flags = String(row.has || "").split("").map((flag) => flag === "1");
      grid.push(pad([row.label, row.ace, ...flags]));
    }
  }
  return { grid, width, teams, sectionRows };
}

/** { "Rank label|permission id": true|false } for diffing one generation of the sheet against the next. */
export function grantMap(headerRow, rows) {
  const out = new Map();
  for (const row of rows) {
    const id = String(row[1] ?? "");
    if (!id) continue;
    for (let column = FIXED_COLUMNS; column < headerRow.length; column++) {
      const value = row[column];
      if (value === true || value === false) out.set(`${headerRow[column]}|${id}`, { granted: value, label: String(row[0] ?? id), id, rank: String(headerRow[column]) });
    }
  }
  return out;
}

export function grantMapFromGrid(grid) {
  return grantMap(grid[HEADER_ROWS - 1], grid.slice(HEADER_ROWS));
}

/** Rows for the Changes tab: every rank/permission pair whose state differs from the previous map. */
export function diffGrants(previous, next, stamp) {
  const changes = [];
  for (const [key, now] of next) {
    const before = previous.get(key);
    if (before === undefined || before.granted === now.granted) continue;
    changes.push([stamp, now.rank, now.label, now.id, now.granted ? "Granted" : "Revoked"]);
  }
  return changes;
}

export class ServiceAccount {
  constructor(info) {
    this.email = info.client_email;
    this.tokenUri = info.token_uri || "https://oauth2.googleapis.com/token";
    this.privateKey = info.private_key;
    this.token = "";
    this.expires = 0;
  }

  static fromFile(path) {
    return new ServiceAccount(JSON.parse(readFileSync(path, "utf8")));
  }

  assertion(nowSeconds = Math.floor(Date.now() / 1000)) {
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(JSON.stringify({ iss: this.email, scope: SHEETS_SCOPE, aud: this.tokenUri, iat: nowSeconds, exp: nowSeconds + 3600 }));
    const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(this.privateKey).toString("base64url");
    return `${header}.${claims}.${signature}`;
  }

  async accessToken(fetchImpl = fetch) {
    if (this.token && Date.now() < this.expires - 60000) return this.token;
    const response = await fetchImpl(this.tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: this.assertion() }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Google refused the staff permissions service account (HTTP ${response.status}).`);
    const data = await response.json();
    this.token = data.access_token;
    this.expires = Date.now() + Number(data.expires_in || 3600) * 1000;
    return this.token;
  }
}

export class SheetsClient {
  constructor(spreadsheetId, account, fetchImpl = fetch) {
    this.spreadsheetId = spreadsheetId;
    this.account = account;
    this.fetch = fetchImpl;
  }

  async request(method, path, { params, body } = {}) {
    const query = params ? `?${new URLSearchParams(params)}` : "";
    const url = `${SHEETS_API}/${this.spreadsheetId}${path}${query}`;
    let lastError;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await this.fetch(url, {
        method,
        headers: { Authorization: `Bearer ${await this.account.accessToken(this.fetch)}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) return response.json();
      if ([429, 500, 502, 503].includes(response.status) && attempt < 3) {
        lastError = new Error(`Sheets HTTP ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt));
        continue;
      }
      const detail = await response.json().then((json) => json?.error?.message || "").catch(() => "");
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Google denied access to the staff permissions sheet. Share it with ${this.account.email} as an editor. ${detail}`.trim());
      }
      throw new Error(`The staff permissions sheet returned HTTP ${response.status}. ${detail}`.trim());
    }
    throw lastError;
  }

  metadata() {
    return this.request("GET", "", { params: { fields: "sheets(properties(sheetId,title),conditionalFormats)" } });
  }

  values(range, params = {}) {
    return this.request("GET", `/values/${encodeURIComponent(range)}`, { params: { valueRenderOption: "UNFORMATTED_VALUE", ...params } });
  }

  batchUpdate(requests) {
    return this.request("POST", ":batchUpdate", { body: { requests } });
  }

  updateValues(range, values) {
    return this.request("PUT", `/values/${encodeURIComponent(range)}`, { params: { valueInputOption: "RAW" }, body: { range, majorDimension: "ROWS", values } });
  }

  appendValues(range, values) {
    return this.request("POST", `/values/${encodeURIComponent(range)}:append`, { params: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" }, body: { values } });
  }

  clear(range) {
    return this.request("POST", `/values/${encodeURIComponent(range)}:clear`, { body: {} });
  }
}

const rgb = (hex) => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });
const WHITE = rgb("#ffffff");
const NAVY = rgb("#0b1f3a");
const BLUE = rgb("#17407a");
const SECTION = rgb("#dbe7f7");

/** batchUpdate requests that restyle the Permissions tab to match its current layout. */
export function formatRequests(sheetId, layout, existingRules = 0) {
  const { width, grid, teams, sectionRows } = layout;
  const rows = grid.length;
  const range = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
  const requests = [];
  for (let index = existingRules - 1; index >= 0; index--) requests.push({ deleteConditionalFormatRule: { sheetId, index } });
  requests.push({ unmergeCells: { range: range(0, rows, 0, width) } });
  requests.push({ repeatCell: { range: range(0, rows, 0, width), cell: { userEnteredFormat: {} }, fields: "userEnteredFormat" } });
  requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: HEADER_ROWS, frozenColumnCount: FIXED_COLUMNS } }, fields: "gridProperties(frozenRowCount,frozenColumnCount)" } });
  requests.push({ mergeCells: { range: range(0, 1, 0, width), mergeType: "MERGE_ALL" } });
  requests.push({ mergeCells: { range: range(1, 2, 0, width), mergeType: "MERGE_ALL" } });
  requests.push({ repeatCell: { range: range(0, 1, 0, width), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16, foregroundColor: NAVY }, verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(textFormat,verticalAlignment)" } });
  requests.push({ repeatCell: { range: range(1, 2, 0, width), cell: { userEnteredFormat: { textFormat: { italic: true, fontSize: 10, foregroundColor: rgb("#52606d") }, wrapStrategy: "WRAP", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(textFormat,wrapStrategy,verticalAlignment)" } });
  for (const team of teams) {
    if (team.end - team.start > 1) requests.push({ mergeCells: { range: range(2, 3, team.start, team.end), mergeType: "MERGE_ALL" } });
  }
  requests.push({ repeatCell: { range: range(2, HEADER_ROWS, 0, width), cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { bold: true, foregroundColor: WHITE }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)" } });
  requests.push({ repeatCell: { range: range(2, 3, FIXED_COLUMNS, width), cell: { userEnteredFormat: { backgroundColor: BLUE } }, fields: "userEnteredFormat.backgroundColor" } });
  requests.push({ repeatCell: { range: range(2, HEADER_ROWS, 0, FIXED_COLUMNS), cell: { userEnteredFormat: { horizontalAlignment: "LEFT" } }, fields: "userEnteredFormat.horizontalAlignment" } });
  requests.push({ repeatCell: { range: range(HEADER_ROWS, rows, FIXED_COLUMNS, width), cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat.horizontalAlignment" } });
  requests.push({ repeatCell: { range: range(HEADER_ROWS, rows, 1, 2), cell: { userEnteredFormat: { textFormat: { foregroundColor: rgb("#52606d"), fontFamily: "Roboto Mono", fontSize: 9 } } }, fields: "userEnteredFormat.textFormat" } });
  for (const row of sectionRows) {
    requests.push({ repeatCell: { range: range(row, row + 1, 0, width), cell: { userEnteredFormat: { backgroundColor: SECTION, textFormat: { bold: true, foregroundColor: NAVY } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } });
  }
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 320 }, fields: "pixelSize" } });
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 360 }, fields: "pixelSize" } });
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: FIXED_COLUMNS, endIndex: width }, properties: { pixelSize: 104 }, fields: "pixelSize" } });
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 56 }, fields: "pixelSize" } });
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 42 }, fields: "pixelSize" } });
  const body = range(HEADER_ROWS, rows, FIXED_COLUMNS, width);
  requests.push({ addConditionalFormatRule: { index: 0, rule: { ranges: [body], booleanRule: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: `=${columnLetter(FIXED_COLUMNS)}${HEADER_ROWS + 1}=TRUE` }] }, format: { backgroundColor: rgb("#c6e8d2"), textFormat: { foregroundColor: rgb("#1b5e3a"), bold: true } } } } } });
  requests.push({ addConditionalFormatRule: { index: 1, rule: { ranges: [body], booleanRule: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: `=${columnLetter(FIXED_COLUMNS)}${HEADER_ROWS + 1}=FALSE` }] }, format: { backgroundColor: rgb("#f6dada"), textFormat: { foregroundColor: rgb("#8a2b2b") } } } } } });
  return requests;
}

/** Writes one matrix into the sheet: Permissions tab rebuilt, Changes tab appended. */
export async function publishMatrix(client, matrix, { now = new Date(), log = console } = {}) {
  const stamp = easternStamp(now);
  const layout = buildPermissionsGrid(matrix, stamp);
  const metadata = await client.metadata();
  const tabs = new Map(metadata.sheets.map((sheet) => [sheet.properties.title, sheet]));
  const missing = [PERMISSIONS_TAB, CHANGES_TAB].filter((title) => !tabs.has(title));
  if (missing.length) {
    await client.batchUpdate(missing.map((title) => ({ addSheet: { properties: { title } } })));
    return publishMatrix(client, matrix, { now, log });
  }
  const permissions = tabs.get(PERMISSIONS_TAB);
  const changes = tabs.get(CHANGES_TAB);

  const previous = await client.values(`${PERMISSIONS_TAB}!A1:ZZ`).then((data) => data.values || []).catch(() => []);
  const diff = previous.length > HEADER_ROWS ? diffGrants(grantMapFromGrid(previous), grantMapFromGrid(layout.grid), stamp) : [];

  await client.clear(`${PERMISSIONS_TAB}!A1:ZZ`);
  await client.updateValues(`${PERMISSIONS_TAB}!A1`, layout.grid);
  await client.batchUpdate(formatRequests(permissions.properties.sheetId, layout, (permissions.conditionalFormats || []).length));

  const existingChanges = await client.values(`${CHANGES_TAB}!A1:E1`).then((data) => data.values || []).catch(() => []);
  if (!existingChanges.length) {
    await client.updateValues(`${CHANGES_TAB}!A1`, [["When", "Rank", "Permission", "Permission ID", "Change"]]);
    await client.batchUpdate([
      { repeatCell: { range: { sheetId: changes.properties.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 }, cell: { userEnteredFormat: { backgroundColor: NAVY, textFormat: { bold: true, foregroundColor: WHITE } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
      { updateSheetProperties: { properties: { sheetId: changes.properties.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
      { updateDimensionProperties: { range: { sheetId: changes.properties.sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 5 }, properties: { pixelSize: 210 }, fields: "pixelSize" } },
    ]);
  }
  if (diff.length) await client.appendValues(`${CHANGES_TAB}!A:E`, diff);
  log.log?.(`[FBRP staff permissions sheet] updated (${layout.grid.length - HEADER_ROWS} rows, ${diff.length} change(s))`);
  return { rows: layout.grid.length - HEADER_ROWS, changes: diff.length };
}

export async function fetchMatrix({ origin, token, fetchImpl = fetch }) {
  const base = String(origin || "http://127.0.0.1:30120/fbrp_core").replace(/\/$/, "");
  const response = await fetchImpl(`${base}/staff-permissions`, { headers: { Authorization: `Bearer ${token || ""}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`fbrp_core /staff-permissions returned HTTP ${response.status}`);
  const matrix = await response.json();
  if (!Array.isArray(matrix.ranks) || !Array.isArray(matrix.sections)) throw new Error("fbrp_core returned an unexpected staff permissions matrix");
  return matrix;
}

/** Polls the game and publishes when the matrix changes. The first successful poll always publishes. */
export function startStaffPermissionsSheetSync({ client, load, intervalMs = 60000, log = console }) {
  let lastHash = null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const matrix = await load();
      const hash = matrixHash(matrix);
      if (hash === lastHash) return;
      await publishMatrix(client, matrix, { log });
      lastHash = hash;
    } catch (error) {
      log.error?.("[FBRP staff permissions sheet]", error.message || error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}

/** Sync from the environment; quietly off until a service account key and a sheet id are configured. */
export function startStaffPermissionsSheetFromEnv(env = process.env, log = console) {
  const keyFile = String(env.FBRP_STAFF_PERMS_SERVICE_ACCOUNT_FILE || "").trim();
  const spreadsheetId = String(env.FBRP_STAFF_PERMS_SHEET_ID || DEFAULT_SPREADSHEET_ID).trim();
  if (!keyFile || !spreadsheetId) {
    log.log?.("[FBRP staff permissions sheet] disabled: set FBRP_STAFF_PERMS_SERVICE_ACCOUNT_FILE to enable it");
    return null;
  }
  let account;
  try {
    account = ServiceAccount.fromFile(keyFile);
  } catch (error) {
    log.error?.("[FBRP staff permissions sheet] could not read the service account key:", error.code || error.message);
    return null;
  }
  const client = new SheetsClient(spreadsheetId, account);
  return startStaffPermissionsSheetSync({
    client,
    load: () => fetchMatrix({ origin: env.FBRP_FIVEM_ORIGIN, token: env.FBRP_SERVICE_TOKEN }),
    log,
  });
}
