-- Extends Discord role FBRP | Custom Weapons to the R4 rifle, SAW/M249, M4A1 and SIG
-- addon weapons that were added to vMenu addons.json.

INSERT INTO ace_entries(group_name,object,mode) VALUES
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m249acog','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m249iron','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m249red','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_saw','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_sawacog','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_sawred','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m4m203a','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m4m203r','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m4m203','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m4acog','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m4iron','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_m4reddot','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_urgi','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_mcxspear','allow'),
 ('custom_weapons','vMenu.WeaponOptions.WhitelistedModels.weapon_xm7','allow')
ON DUPLICATE KEY UPDATE mode='allow';
