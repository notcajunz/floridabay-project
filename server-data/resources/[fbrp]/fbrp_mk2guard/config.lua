Mk2Config = {
    -- Discord role (FBRP | Mk2 Weapons, sold in the store) that unlocks every Mk2 weapon.
    GuildId = '1557594282976747550',
    RoleId  = '1564110293846724710',

    -- Every Mk2 weapon in the base game. Players without the role lose these the moment they hold one,
    -- however they got it (vMenu, armory, loadout, admin give).
    Weapons = {
        'WEAPON_PISTOL_MK2', 'WEAPON_SNSPISTOL_MK2', 'WEAPON_REVOLVER_MK2', 'WEAPON_SMG_MK2',
        'WEAPON_ASSAULTRIFLE_MK2', 'WEAPON_CARBINERIFLE_MK2', 'WEAPON_COMBATMG_MK2', 'WEAPON_HEAVYSNIPER_MK2',
        'WEAPON_MARKSMANRIFLE_MK2', 'WEAPON_PUMPSHOTGUN_MK2', 'WEAPON_BULLPUPRIFLE_MK2', 'WEAPON_SPECIALCARBINE_MK2',
    },

    Message = 'Mk2 weapons need the Mk2 Weapons role. Get it in the store at store.floridabay.net.',
}
