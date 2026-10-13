/**
 * Reassign active staff callsigns by category and rank.
 *
 * Categories own non-overlapping numeric ranges. Within each category, higher
 * ACE rank_order values receive lower callsigns. Existing callsign order is
 * retained among members of the same rank so a rebalance is deterministic and
 * only moves people when the rank hierarchy requires it.
 */
export async function rebalanceCallsigns(db, actorId = "system") {
  const stamp = Date.now();
  return db.transaction(async (query) => {
    const members = await query(
      `SELECT m.discord_id,m.callsign,m.joined_at,m.rank_changed_at,
              r.id rank_id,r.sort_order rank_sort,g.rank_order,
              c.id category_id,c.name category_name,c.callsign_start,c.callsign_end,c.sort_order category_sort
         FROM staff_roster_members m
         JOIN staff_roster_ranks r ON r.id=m.rank_id
         JOIN staff_roster_categories c ON c.id=r.category_id
         LEFT JOIN ace_groups g ON g.name=r.ace_group
        WHERE m.status<>'removed'
        ORDER BY c.sort_order,c.id,g.rank_order DESC,r.sort_order,r.id,
                 m.callsign IS NULL,m.callsign,m.joined_at,m.discord_id
        FOR UPDATE`,
    );

    const categories = new Map();
    for (const member of members) {
      const id = Number(member.category_id);
      if (!categories.has(id)) categories.set(id, []);
      categories.get(id).push(member);
    }

    const assignments = [];
    for (const categoryMembers of categories.values()) {
      const first = categoryMembers[0];
      const start = Number(first.callsign_start);
      const end = Number(first.callsign_end);
      if (categoryMembers.length > end - start + 1)
        throw new Error(`${first.category_name} has ${categoryMembers.length} staff but only ${end - start + 1} callsigns (${start}–${end}).`);

      categoryMembers.sort((left, right) =>
        Number(right.rank_order ?? -1) - Number(left.rank_order ?? -1)
        || Number(left.rank_sort ?? 9999) - Number(right.rank_sort ?? 9999)
        || (left.callsign == null ? Number.MAX_SAFE_INTEGER : Number(left.callsign))
          - (right.callsign == null ? Number.MAX_SAFE_INTEGER : Number(right.callsign))
        || Number(left.joined_at ?? Number.MAX_SAFE_INTEGER) - Number(right.joined_at ?? Number.MAX_SAFE_INTEGER)
        || String(left.discord_id).localeCompare(String(right.discord_id)),
      );

      categoryMembers.forEach((member, index) => assignments.push({
        discordId: String(member.discord_id),
        categoryId: Number(member.category_id),
        categoryName: String(member.category_name),
        rankId: Number(member.rank_id),
        previous: member.callsign == null ? null : Number(member.callsign),
        callsign: start + index,
      }));
    }

    const changes = assignments.filter((row) => row.previous !== row.callsign);
    if (!changes.length) return { assignments, changes };

    // Callsigns are globally unique. Clear the planned rows first so swaps and
    // shifts cannot collide with one another halfway through the transaction.
    const ids = assignments.map((row) => row.discordId);
    await query(
      `UPDATE staff_roster_members SET callsign=NULL WHERE discord_id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    for (const row of assignments)
      await query(
        "UPDATE staff_roster_members SET callsign=?,updated_at=IF(?<>?, ?, updated_at) WHERE discord_id=?",
        [row.callsign, row.previous ?? -1, row.callsign, stamp, row.discordId],
      );
    for (const row of changes)
      await query(
        "INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at) VALUES(?,?,?,?,?)",
        [row.discordId, "callsign_rebalance", String(actorId), JSON.stringify({ from: row.previous, to: row.callsign, reason: "rank_order" }), stamp],
      );
    return { assignments, changes };
  });
}
