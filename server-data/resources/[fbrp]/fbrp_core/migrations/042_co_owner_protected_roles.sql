-- Protected-role administration is never granted below Co-Owner.
DELETE e
FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
JOIN ace_groups co ON co.name = 'co_owner'
WHERE g.rank_order < co.rank_order
  AND e.object = 'fbrp.roles.protect';
