-- Make the main-server Founder role an ACE-gated senior role. The group has
-- every ACE permission except the two capabilities that create or remove
-- automated-security exemptions. Those mutations are also owner-ID gated in
-- the Discord bot as a second layer of protection.

INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by)
VALUES ('founder','Founder',1000,TRUE,'system')
ON DUPLICATE KEY UPDATE
  label=VALUES(label),
  rank_order=VALUES(rank_order),
  staff_only=VALUES(staff_only);

INSERT INTO ace_entries(group_name,object,mode) VALUES
 ('founder','*','allow'),
 ('founder','fbrp.botguard.exemptions','deny'),
 ('founder','fbrp.security.exemptions','deny')
ON DUPLICATE KEY UPDATE mode=VALUES(mode);

INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name)
VALUES ('1557594282976747550','1558616304997498960','founder');

-- Current holder of FBRP | Founder. Senior staff bindings are ACE-authoritative,
-- so membership is explicit rather than trusting a Discord role grant alone.
INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at)
VALUES ('1099651002208104488','founder','manual','system',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000);
