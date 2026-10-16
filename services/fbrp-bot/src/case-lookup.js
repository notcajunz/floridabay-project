const json = (value) => {
  if (value == null || value === "") return value ?? null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
};

const publicModerationId = (row) => row?.ban_id || `FB-${String(row?.id || 0).padStart(8, "0")}`;

/**
 * Resolve either public case namespace used by FBRP.
 *
 * FB-* is the shared Discord/network/game moderation ledger. IA-* is the
 * Internal Affairs case system. A bare database id is accepted as a
 * convenience and prefers the moderation ledger when both tables contain it.
 */
export async function lookupAnyCase(db, reference) {
  const raw = String(reference || "").trim().replace(/^`|`$/g, "");
  if (!raw || raw.length > 32) throw new Error("Enter a case ID such as FB-123456 or IA-2026-0001.");
  const upper = raw.toUpperCase();
  const numeric = /^#?\d+$/.test(upper) ? Number(upper.replace(/^#/, "")) : null;

  let moderation = null;
  if (upper.startsWith("FB-") || numeric != null) {
    moderation = numeric != null
      ? await db.one("SELECT * FROM moderation_cases WHERE id=?", [numeric])
      : await db.one(
          "SELECT * FROM moderation_cases WHERE UPPER(ban_id)=? OR (ban_id IS NULL AND CONCAT('FB-',LPAD(id,8,'0'))=?) LIMIT 1",
          [upper, upper],
        );
  }
  if (moderation) return moderationCase(db, moderation);

  let iaa = null;
  if (upper.startsWith("IA-") || numeric != null) {
    iaa = numeric != null
      ? await db.one("SELECT * FROM iaa_cases WHERE id=?", [numeric])
      : await db.one("SELECT * FROM iaa_cases WHERE UPPER(reference)=? LIMIT 1", [upper]);
  }
  if (iaa) return internalAffairsCase(db, iaa);

  throw new Error(`No case was found for ${raw}.`);
}

async function moderationCase(db, row) {
  const publicId = publicModerationId(row);
  const [sourceCase, derivedCases, appeals, audits] = await Promise.all([
    row.source_case_id ? db.one("SELECT * FROM moderation_cases WHERE id=?", [row.source_case_id]) : null,
    db.query("SELECT * FROM moderation_cases WHERE source_case_id=? ORDER BY id", [row.id]),
    db.query("SELECT * FROM moderation_appeals WHERE case_id=? ORDER BY id", [row.id]),
    db.query(
      "SELECT * FROM audit_log WHERE target_id=? OR payload LIKE ? OR payload LIKE ? ORDER BY id DESC LIMIT 250",
      [publicId, `%\"caseId\":${Number(row.id)}%`, `%${publicId}%`],
    ),
  ]);
  const appealIds = appeals.map((appeal) => Number(appeal.id)).filter(Number.isFinite);
  const events = appealIds.length
    ? await db.query(`SELECT * FROM moderation_appeal_events WHERE appeal_id IN (${appealIds.map(() => "?").join(",")}) ORDER BY id`, appealIds)
    : [];
  const eventsByAppeal = new Map();
  for (const event of events) {
    const key = Number(event.appeal_id);
    if (!eventsByAppeal.has(key)) eventsByAppeal.set(key, []);
    eventsByAppeal.get(key).push({ ...event, data: json(event.data) });
  }
  return {
    kind: "moderation",
    publicId,
    case: row,
    sourceCase: sourceCase ? { ...sourceCase, publicId: publicModerationId(sourceCase) } : null,
    derivedCases: derivedCases.map((item) => ({ ...item, publicId: publicModerationId(item) })),
    appeals: appeals.map((appeal) => ({
      ...appeal,
      answers: json(appeal.answers),
      evidence: json(appeal.evidence),
      events: eventsByAppeal.get(Number(appeal.id)) || [],
    })),
    audits: audits.map((item) => ({ ...item, payload: json(item.payload) })),
  };
}

async function internalAffairsCase(db, row) {
  const [entries, discipline, audits] = await Promise.all([
    db.query("SELECT * FROM iaa_case_entries WHERE case_id=? ORDER BY id", [row.id]),
    db.query("SELECT * FROM iaa_discipline WHERE case_id=? ORDER BY id", [row.id]),
    db.query(
      "SELECT * FROM audit_log WHERE target_id=? OR payload LIKE ? OR payload LIKE ? ORDER BY id DESC LIMIT 250",
      [row.reference, `%\"caseId\":${Number(row.id)}%`, `%${row.reference}%`],
    ),
  ]);
  return {
    kind: "internal_affairs",
    publicId: row.reference,
    case: { ...row, intel: json(row.intel) },
    entries,
    discipline: discipline.map((item) => ({ ...item, saved_roles: json(item.saved_roles) })),
    audits: audits.map((item) => ({ ...item, payload: json(item.payload) })),
  };
}

export function moderationCaseState(row, stamp = Date.now()) {
  const persistent = new Set(["ban", "blacklist", "timeout"]);
  if (!persistent.has(String(row?.action || "").toLowerCase())) return "recorded";
  if (!Number(row?.active)) return "lifted";
  if (row?.expires_at && Number(row.expires_at) <= stamp) return "expired";
  return "active";
}
