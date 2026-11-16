import { ServiceAccount } from "../staff-permissions-sheet.js";

/**
 * Minimal Google Sheets / Docs / Drive client for the IAA documents.
 *
 * The files are created by the bot's own service account, so they are private to it: nobody can
 * open one until the bot's access system adds that person's Google account. The key file path comes
 * from IAA_GOOGLE_SERVICE_ACCOUNT_FILE and is never logged.
 */

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
].join(" ");

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DOCS = "https://docs.googleapis.com/v1/documents";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

export class GoogleError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Column letters for a 1-based index: 1 -> A, 27 -> AA. */
export function columnName(index) {
  let name = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export class GoogleWorkspace {
  constructor(account, fetchImpl = fetch) {
    this.account = account;
    this.fetch = fetchImpl;
  }

  static fromEnv(env = process.env) {
    const file = String(env.IAA_GOOGLE_SERVICE_ACCOUNT_FILE || "").trim();
    if (!file) return null;
    return new GoogleWorkspace(ServiceAccount.fromFile(file, GOOGLE_SCOPES));
  }

  async request(method, url, body) {
    const token = await this.account.accessToken(this.fetch);
    const response = await this.fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new GoogleError(`Google ${method} failed (HTTP ${response.status}): ${data?.error?.message || "no detail"}`, response.status);
    return data;
  }

  /** Creates an empty spreadsheet with the named tabs. Returns its file id. */
  async createSpreadsheet(title, tabs) {
    const data = await this.request("POST", SHEETS, { properties: { title }, sheets: tabs.map((t) => ({ properties: { title: t } })) });
    return data.spreadsheetId;
  }

  async createDocument(title) {
    const data = await this.request("POST", DOCS, { title });
    return data.documentId;
  }

  /**
   * Replaces a tab's contents with `grid`. Cells merged by whoever used a reused sheet before are unmerged
   * first, because a merge silently hides every value except the top-left one.
   */
  async writeSheet(id, tab, grid) {
    const width = Math.max(1, ...grid.map((r) => r.length));
    const range = `${tab}!A1:${columnName(width)}${Math.max(grid.length, 1)}`;
    const meta = await this.request("GET", `${SHEETS}/${id}?fields=sheets.properties(sheetId,title)`);
    const sheetId = meta.sheets?.find((s) => s.properties.title === tab)?.properties.sheetId;
    if (sheetId !== undefined) await this.request("POST", `${SHEETS}/${id}:batchUpdate`, { requests: [{ unmergeCells: { range: { sheetId } } }] });
    await this.request("POST", `${SHEETS}/${id}/values/${encodeURIComponent(tab)}:clear`, {});
    await this.request("PUT", `${SHEETS}/${id}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { range, majorDimension: "ROWS", values: grid });
  }

  /** Replaces the whole body of a document with the given paragraphs: [{ style, text }]. */
  async writeDocument(id, paragraphs) {
    const doc = await this.request("GET", `${DOCS}/${id}`);
    const end = (doc.body?.content?.at(-1)?.endIndex || 2) - 1;
    const requests = [];
    if (end > 1) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: end } } });
    const text = paragraphs.map((p) => `${p.text}\n`).join("");
    requests.push({ insertText: { location: { index: 1 }, text } });
    let cursor = 1;
    for (const p of paragraphs) {
      const length = p.text.length + 1;
      if (p.style && p.style !== "NORMAL_TEXT")
        requests.push({ updateParagraphStyle: { range: { startIndex: cursor, endIndex: cursor + length }, paragraphStyle: { namedStyleType: p.style }, fields: "namedStyleType" } });
      cursor += length;
    }
    await this.request("POST", `${DOCS}/${id}:batchUpdate`, { requests });
  }

  /** Name, type and what the bot may do with a file it was given. */
  async inspect(fileId) {
    return this.request("GET", `${DRIVE}/${fileId}?fields=name,mimeType,capabilities(canEdit,canShare)&supportsAllDrives=true`);
  }

  /**
   * Makes sure the spreadsheet has a tab with this name. A dedicated file with a single tab (a new sheet,
   * or one cleared for reuse) has that tab renamed instead of leaving an empty one behind.
   */
  async ensureTab(id, tab) {
    const data = await this.request("GET", `${SHEETS}/${id}?fields=sheets.properties(sheetId,title)`);
    const tabs = data.sheets || [];
    if (tabs.some((t) => t.properties.title === tab)) return;
    const request = tabs.length === 1
      ? { updateSheetProperties: { properties: { sheetId: tabs[0].properties.sheetId, title: tab }, fields: "title" } }
      : { addSheet: { properties: { title: tab } } };
    await this.request("POST", `${SHEETS}/${id}:batchUpdate`, { requests: [request] });
  }

  /** Gives one Google account access. Returns the permission id used to revoke it later. */
  async share(fileId, email, role) {
    const data = await this.request("POST", `${DRIVE}/${fileId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, { type: "user", role, emailAddress: email });
    return data.id;
  }

  async unshare(fileId, permissionId) {
    try {
      await this.request("DELETE", `${DRIVE}/${fileId}/permissions/${permissionId}?supportsAllDrives=true`);
    } catch (error) {
      if (error.status !== 404) throw error; // already gone
    }
  }

  /** Every account that can open the file (used to prove nothing is shared outside the access list). */
  async listAccess(fileId) {
    const data = await this.request("GET", `${DRIVE}/${fileId}/permissions?fields=permissions(id,type,role,emailAddress)&supportsAllDrives=true`);
    return data.permissions || [];
  }

  link(kind, id) {
    return kind === "doc" ? `https://docs.google.com/document/d/${id}/edit` : `https://docs.google.com/spreadsheets/d/${id}/edit`;
  }
}
