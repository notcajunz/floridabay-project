-- Rename the three management ranks and ACE groups while preserving their
-- permissions, memberships, hierarchy, and existing Discord role bindings.

INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by,created_at)
SELECT 'trial_management','Trial Management',rank_order,staff_only,created_by,created_at
FROM ace_groups WHERE name='junior_management'
ON DUPLICATE KEY UPDATE label=VALUES(label),rank_order=VALUES(rank_order),staff_only=VALUES(staff_only);

INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by,created_at)
SELECT 'executive_management','Executive Management',rank_order,staff_only,created_by,created_at
FROM ace_groups WHERE name='community_director'
ON DUPLICATE KEY UPDATE label=VALUES(label),rank_order=VALUES(rank_order),staff_only=VALUES(staff_only);

INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT 'executive_management',object,mode FROM ace_entries WHERE group_name='community_director';
INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at)
SELECT discord_id,'executive_management',origin,added_by,added_at FROM ace_memberships WHERE group_name='community_director';
INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name)
SELECT guild_id,role_id,'executive_management' FROM discord_role_bindings WHERE group_name='community_director';
UPDATE network_syncs SET group_name='executive_management',role_name='Executive Management' WHERE group_name='community_director';
UPDATE organizations SET ace_group='executive_management' WHERE ace_group='community_director';
UPDATE staff_roster_ranks SET ace_group='executive_management' WHERE ace_group='community_director';
DELETE FROM ace_groups WHERE name='community_director';

INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by,created_at)
SELECT 'community_director','Community Director',rank_order,staff_only,created_by,created_at
FROM ace_groups WHERE name='assistant_community_director'
ON DUPLICATE KEY UPDATE label=VALUES(label),rank_order=VALUES(rank_order),staff_only=VALUES(staff_only);

INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT 'community_director',object,mode FROM ace_entries WHERE group_name='assistant_community_director';
INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at)
SELECT discord_id,'community_director',origin,added_by,added_at FROM ace_memberships WHERE group_name='assistant_community_director';
INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name)
SELECT guild_id,role_id,'community_director' FROM discord_role_bindings WHERE group_name='assistant_community_director';
UPDATE network_syncs SET group_name='community_director',role_name='Community Director' WHERE group_name='assistant_community_director';
UPDATE organizations SET ace_group='community_director' WHERE ace_group='assistant_community_director';
UPDATE staff_roster_ranks SET ace_group='community_director' WHERE ace_group='assistant_community_director';
DELETE FROM ace_groups WHERE name='assistant_community_director';

INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT 'trial_management',object,mode FROM ace_entries WHERE group_name='junior_management';
INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at)
SELECT discord_id,'trial_management',origin,added_by,added_at FROM ace_memberships WHERE group_name='junior_management';
INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name)
SELECT guild_id,role_id,'trial_management' FROM discord_role_bindings WHERE group_name='junior_management';
UPDATE network_syncs SET group_name='trial_management',role_name='Trial Management' WHERE group_name='junior_management';
UPDATE organizations SET ace_group='trial_management' WHERE ace_group='junior_management';
UPDATE staff_roster_ranks SET ace_group='trial_management' WHERE ace_group='junior_management';
DELETE FROM ace_groups WHERE name='junior_management';

-- Keep the requested main-server role identities authoritative.
DELETE binding FROM discord_role_bindings binding
JOIN network_guilds guild ON guild.guild_id=binding.guild_id AND guild.kind='main'
WHERE binding.group_name='trial_management' AND binding.role_id<>'1561889647918063738';
INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name)
SELECT guild_id,'1561889647918063738','trial_management' FROM network_guilds WHERE kind='main';

DELETE binding FROM discord_role_bindings binding
JOIN network_guilds guild ON guild.guild_id=binding.guild_id AND guild.kind='main'
WHERE binding.group_name='executive_management' AND binding.role_id<>'1557960561097183282';
INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name)
SELECT guild_id,'1557960561097183282','executive_management' FROM network_guilds WHERE kind='main';

UPDATE staff_roster_categories SET name='Trial Management' WHERE name='Junior Management';
UPDATE staff_roster_ranks SET name='Executive Management' WHERE name='Community Director' AND ace_group='executive_management';
UPDATE staff_roster_ranks SET name='Community Director' WHERE name='Assistant Community Director' AND ace_group='community_director';
UPDATE staff_roster_ranks SET name='Trial Management' WHERE name='Junior Management' OR ace_group='trial_management';
UPDATE staff_roster_ranks
SET discord_role_id='1561889647918063738',discord_guild_id=(SELECT guild_id FROM network_guilds WHERE kind='main' ORDER BY guild_id LIMIT 1)
WHERE ace_group='trial_management';
UPDATE staff_roster_ranks
SET discord_role_id='1557960561097183282',discord_guild_id=(SELECT guild_id FROM network_guilds WHERE kind='main' ORDER BY guild_id LIMIT 1)
WHERE ace_group='executive_management';

UPDATE staff_roster_members SET rank_name='Executive Management' WHERE rank_name='Community Director';
UPDATE staff_roster_members SET rank_name='Community Director' WHERE rank_name='Assistant Community Director';
UPDATE staff_roster_members SET rank_name='Trial Management' WHERE rank_name='Junior Management';
UPDATE staff_exam_applications SET rank_at_submit='Executive Management' WHERE rank_at_submit='Community Director';
UPDATE staff_exam_applications SET rank_at_submit='Community Director' WHERE rank_at_submit='Assistant Community Director';
UPDATE staff_exam_applications SET rank_at_submit='Trial Management' WHERE rank_at_submit='Junior Management';
UPDATE headtags SET label='Executive Management' WHERE label='Community Director';
UPDATE headtags SET label='Community Director' WHERE label='Assistant Community Director';
UPDATE headtags SET label='Trial Management' WHERE label='Junior Management';

-- Rewrite historical text with placeholders so overlapping names do not cascade.
UPDATE staff_exams
SET description=REPLACE(REPLACE(REPLACE(REPLACE(description,'Assistant Community Director','__FBRP_CD__'),'Community Director','Executive Management'),'__FBRP_CD__','Community Director'),'Junior Management','Trial Management')
WHERE description LIKE '%Community Director%' OR description LIKE '%Junior Management%';
UPDATE audit_log
SET target_id=REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(target_id,'assistant_community_director','__fbrp_cd__'),'community_director','executive_management'),'__fbrp_cd__','community_director'),'junior_management','trial_management'),'Junior Management','Trial Management')
WHERE target_id LIKE '%community_director%' OR target_id LIKE '%junior_management%' OR target_id LIKE '%Junior Management%';
UPDATE audit_log
SET payload=REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(payload,'Assistant Community Director','__FBRP_CD__'),'Community Director','Executive Management'),'__FBRP_CD__','Community Director'),'assistant_community_director','__fbrp_cd__'),'community_director','executive_management'),'__fbrp_cd__','community_director'),'junior_management','trial_management')
WHERE payload LIKE '%Community Director%' OR payload LIKE '%community_director%' OR payload LIKE '%junior_management%';
UPDATE staff_roster_history
SET details=REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(details,'Assistant Community Director','__FBRP_CD__'),'Community Director','Executive Management'),'__FBRP_CD__','Community Director'),'assistant_community_director','__fbrp_cd__'),'community_director','executive_management'),'__fbrp_cd__','community_director'),'junior_management','trial_management')
WHERE details LIKE '%Community Director%' OR details LIKE '%community_director%' OR details LIKE '%junior_management%';
UPDATE network_security_events
SET details=REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(details,'Assistant Community Director','__FBRP_CD__'),'Community Director','Executive Management'),'__FBRP_CD__','Community Director'),'assistant_community_director','__fbrp_cd__'),'community_director','executive_management'),'__fbrp_cd__','community_director'),'junior_management','trial_management')
WHERE details LIKE '%Community Director%' OR details LIKE '%community_director%' OR details LIKE '%junior_management%';
UPDATE global_role_strips
SET ace_memberships=REPLACE(REPLACE(REPLACE(ace_memberships,'assistant_community_director','__fbrp_cd__'),'community_director','executive_management'),'__fbrp_cd__','community_director')
WHERE ace_memberships LIKE '%community_director%';

UPDATE discord_guild_roles SET name=REPLACE(name,'Junior Management','Trial Management') WHERE name LIKE '%Junior Management%';
UPDATE discord_guild_roles SET name=REPLACE(name,'Assistant Community Director','Community Director') WHERE name LIKE '%Assistant Community Director%';
UPDATE discord_guild_roles SET name=REPLACE(name,'Community Director','Executive Management')
WHERE name LIKE '%Community Director%' AND role_id IN ('1557960561097183282','1558266080361840690');
