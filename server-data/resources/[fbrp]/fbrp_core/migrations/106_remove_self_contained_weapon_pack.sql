-- Remove the ACE rows introduced for the withdrawn October 2026 weapon pack.
-- The Custom Weapons group and its Discord role binding remain because they
-- still gate the server's established addon weapons.

DELETE FROM ace_entries
WHERE group_name = 'custom_weapons'
  AND object IN (
    'vMenu.WeaponOptions.WhitelistedModels.nsr9',
    'vMenu.WeaponOptions.WhitelistedModels.sa80',
    'vMenu.WeaponOptions.WhitelistedModels.benellim2',
    'vMenu.WeaponOptions.WhitelistedModels.mp7a2',
    'vMenu.WeaponOptions.WhitelistedModels.scar17fm',
    'vMenu.WeaponOptions.WhitelistedModels.akm',
    'vMenu.WeaponOptions.WhitelistedModels.asval',
    'vMenu.WeaponOptions.WhitelistedModels.g17',
    'vMenu.WeaponOptions.WhitelistedModels.g36',
    'vMenu.WeaponOptions.WhitelistedModels.hkump',
    'vMenu.WeaponOptions.WhitelistedModels.m6ic'
  );
