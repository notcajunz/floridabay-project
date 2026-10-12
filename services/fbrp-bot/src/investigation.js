/**
 * Organization membership and duty history for one Discord account. Past organizations remain
 * visible when the member has clocked shifts there, even if they are no longer on the roster.
 */
export async function organizationActivity(db, discordId, stamp = Date.now()) {
  const duration = "CASE WHEN s.ended_at IS NULL THEN GREATEST(0,FLOOR((s.heartbeat_at-s.started_at)/1000)) ELSE s.seconds END";
  const rows = await db.query(
    `SELECT o.id,o.slug,o.name,o.type,o.active,m.rank_name,m.manager,
            COUNT(s.id) shift_count,
            COALESCE(SUM(CASE WHEN s.started_at>=? THEN ${duration} ELSE 0 END),0) week_seconds,
            COALESCE(SUM(CASE WHEN s.started_at>=? THEN ${duration} ELSE 0 END),0) month_seconds,
            COALESCE(SUM(${duration}),0) total_seconds,
            MAX(s.started_at) last_shift
       FROM organizations o
       LEFT JOIN organization_members m ON m.org_id=o.id AND m.discord_id=?
       LEFT JOIN organization_shifts s ON s.org_id=o.id AND s.discord_id=?
      WHERE m.discord_id IS NOT NULL OR s.discord_id IS NOT NULL
      GROUP BY o.id,o.slug,o.name,o.type,o.active,m.rank_name,m.manager
      ORDER BY o.active DESC,o.name`,
    [stamp - 7 * 86400000, stamp - 30 * 86400000, String(discordId), String(discordId)],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    type: row.type,
    active: Boolean(Number(row.active)),
    member: row.rank_name !== null && row.rank_name !== undefined,
    rank: row.rank_name || null,
    manager: Boolean(Number(row.manager)),
    shifts: Number(row.shift_count || 0),
    weekSeconds: Number(row.week_seconds || 0),
    monthSeconds: Number(row.month_seconds || 0),
    totalSeconds: Number(row.total_seconds || 0),
    lastShift: row.last_shift ? Number(row.last_shift) : null,
  }));
}
