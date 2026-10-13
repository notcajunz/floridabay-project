-- Rename the Head of Management rank everywhere while preserving its hierarchy,
-- permissions, members, Discord role bindings, and headtag identity.

INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by,created_at)
SELECT 'assistant_community_director','Assistant Community Director',rank_order,staff_only,created_by,created_at
FROM ace_groups
WHERE name='head_of_management'
ON DUPLICATE KEY UPDATE
  label=VALUES(label),
  rank_order=VALUES(rank_order),
  staff_only=VALUES(staff_only);

INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT 'assistant_community_director',object,mode
FROM ace_entries
WHERE group_name='head_of_management';

INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at)
SELECT discord_id,'assistant_community_director',origin,added_by,added_at
FROM ace_memberships
WHERE group_name='head_of_management';

INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name)
SELECT guild_id,role_id,'assistant_community_director'
FROM discord_role_bindings
WHERE group_name='head_of_management';

UPDATE staff_roster_ranks
SET name='Assistant Community Director',ace_group='assistant_community_director'
WHERE name='Head of Management' OR ace_group='head_of_management';

UPDATE staff_roster_members
SET rank_name='Assistant Community Director'
WHERE rank_name='Head of Management';

UPDATE headtags
SET label='Assistant Community Director'
WHERE label='Head of Management';

UPDATE staff_exams
SET description=REPLACE(REPLACE(description,'Head of Management','Assistant Community Director'),'Head Of Management','Assistant Community Director')
WHERE description LIKE '%Head of Management%' OR description LIKE '%Head Of Management%';

UPDATE discord_guild_roles
SET name=REPLACE(REPLACE(name,'Head of Management','Assistant Community Director'),'Head Of Management','Assistant Community Director')
WHERE name LIKE '%Head of Management%' OR name LIKE '%Head Of Management%';

UPDATE audit_log
SET target_id=REPLACE(target_id,'head_of_management','assistant_community_director')
WHERE target_id LIKE '%head_of_management%';

UPDATE audit_log
SET payload=REPLACE(REPLACE(REPLACE(payload,'Head of Management','Assistant Community Director'),'Head Of Management','Assistant Community Director'),'head_of_management','assistant_community_director')
WHERE payload LIKE '%Head of Management%' OR payload LIKE '%Head Of Management%' OR payload LIKE '%head_of_management%';

UPDATE staff_roster_history
SET details=REPLACE(REPLACE(REPLACE(details,'Head of Management','Assistant Community Director'),'Head Of Management','Assistant Community Director'),'head_of_management','assistant_community_director')
WHERE details LIKE '%Head of Management%' OR details LIKE '%Head Of Management%' OR details LIKE '%head_of_management%';

UPDATE network_security_events
SET details=REPLACE(REPLACE(REPLACE(details,'Head of Management','Assistant Community Director'),'Head Of Management','Assistant Community Director'),'head_of_management','assistant_community_director')
WHERE details LIKE '%Head of Management%' OR details LIKE '%Head Of Management%' OR details LIKE '%head_of_management%';

DELETE FROM ace_groups
WHERE name='head_of_management';
