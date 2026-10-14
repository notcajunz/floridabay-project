-- Discord role FBRP | Custom Weapons grants only the addon weapons listed in
-- the vMenu addons.json file. The base/replacement weapon catalog remains unchanged.

INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by)
VALUES ('custom_weapons','Custom Weapons',0,FALSE,'system')
ON DUPLICATE KEY UPDATE label=VALUES(label),staff_only=FALSE;

INSERT INTO ace_entries(group_name,object,mode) VALUES
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_mp9a','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_fbiarb','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_hk416b','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_mm4','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m700','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_ghostarp','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_ghostglock','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_tacticalcarbine','allow')
ON DUPLICATE KEY UPDATE mode='allow';

INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name)
VALUES ('1557594282976747550','1558772553789743214','custom_weapons');
