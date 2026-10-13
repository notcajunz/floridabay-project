-- Only the Owner group may be anonymous or immune in EasyAdmin.
DELETE FROM ace_entries
WHERE group_name <> 'owner'
  AND object IN ('easyadmin.immune', 'easyadmin.anon');
