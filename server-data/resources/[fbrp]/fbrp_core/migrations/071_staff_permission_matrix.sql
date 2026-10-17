-- In-game staff permission matrix from the CaliRP staff permissions sheet, mapped
-- onto Florida Bay ACE names. Tiers: Trial Moderator, Moderator, Senior Moderator,
-- Head Moderator, Administrator, Senior Administrator, Trial Head Administrator
-- (the sheet calls it Junior Head Administrator) and Head Administrator.
-- Every group at or above a tier gets that tier row. Groups above Head Administrator
-- are matched through rank_order so management keeps everything it had.
-- Admin and above can force release players from jail, community service, head bag,
-- zip ties and cuffs through the EasyAdmin player menu (fbrp.staff.release).

-- Trial Moderator and above: teleport, warn, spectate, freeze, staff jail, self revive
INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT g.name,o.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'easyadmin.player.teleport.single' object UNION ALL
  SELECT 'easyadmin.player.warn' UNION ALL
  SELECT 'easyadmin.player.spectate' UNION ALL
  SELECT 'easyadmin.player.freeze' UNION ALL
  SELECT 'fbrp.staff.jail' UNION ALL
  SELECT 'vMenu.OnlinePlayers.Menu' UNION ALL
  SELECT 'vMenu.OnlinePlayers.Teleport' UNION ALL
  SELECT 'vMenu.OnlinePlayers.Waypoint' UNION ALL
  SELECT 'vMenu.OnlinePlayers.Spectate' UNION ALL
  SELECT 'vMenu.OnlinePlayers.Summon'
) o
WHERE g.staff_only=TRUE AND g.rank_order>=625;

-- Trial Moderator and Moderator revive themselves only. Senior Moderator and above keep
-- the parent grant, which covers reviving others as well as themselves.
DELETE FROM ace_entries WHERE group_name IN ('trial_moderator','moderator') AND object='fbrp.staff.revive';
INSERT IGNORE INTO ace_entries(group_name,object,mode) VALUES
 ('trial_moderator','fbrp.staff.revive.self','allow'),
 ('moderator','fbrp.staff.revive.self','allow');

-- Moderator and above: NoClip (still only while clocked in)
INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT name,'vMenu.NoClip','allow' FROM ace_groups WHERE staff_only=TRUE AND rank_order>=650;

-- Senior Moderator and above: player blips, priority control, kick, mute, bans, revive others
INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT g.name,o.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'vMenu.MiscSettings.Menu' object UNION ALL
  SELECT 'vMenu.MiscSettings.PlayerBlips' UNION ALL
  SELECT 'fbrp.priority' UNION ALL
  SELECT 'easyadmin.player.kick' UNION ALL
  SELECT 'easyadmin.player.mute' UNION ALL
  SELECT 'easyadmin.player.ban.temporary' UNION ALL
  SELECT 'easyadmin.player.ban.view' UNION ALL
  SELECT 'fbrp.staff.revive'
) o
WHERE g.staff_only=TRUE AND g.rank_order>=675;

-- Moderators and trials do not get kick or mute
DELETE FROM ace_entries WHERE group_name IN ('trial_moderator','moderator') AND object IN ('easyadmin.player.kick','easyadmin.player.mute');

-- Head Moderator and above: player names and the cleanup menu
INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT g.name,o.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'vMenu.MiscSettings.Menu' object UNION ALL
  SELECT 'vMenu.MiscSettings.OverheadNames' UNION ALL
  SELECT 'easyadmin.server.cleanup.cars' UNION ALL
  SELECT 'easyadmin.server.cleanup.props' UNION ALL
  SELECT 'easyadmin.server.cleanup.peds'
) o
WHERE g.staff_only=TRUE AND g.rank_order>=700;

-- Administrator and above: AOP, on duty staff announcements and force release
INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT g.name,o.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'fbrp.aop' object UNION ALL
  SELECT 'fbrp.staff.onduty_announce' UNION ALL
  SELECT 'fbrp.staff.release' UNION ALL
  SELECT 'easyadmin.player.release'
) o
WHERE g.staff_only=TRUE AND g.rank_order>=725;

-- Senior Administrator and above: peacetime
INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT name,'fbrp.peacetime','allow' FROM ace_groups WHERE staff_only=TRUE AND rank_order>=750;

-- Head Administrator and above: server wide staff announcements
INSERT IGNORE INTO ace_entries(group_name,object,mode)
SELECT g.name,o.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'fbrp.announce' object UNION ALL
  SELECT 'easyadmin.server.announce'
) o
WHERE g.staff_only=TRUE AND g.rank_order>=800;

-- Below Head Administrator the announcement permissions are withdrawn
DELETE FROM ace_entries
WHERE group_name IN ('head_moderator','admin','senior_administrator','trial_head_administrator','senior_moderator','moderator','trial_moderator')
  AND object IN ('fbrp.announce','easyadmin.server.announce');
