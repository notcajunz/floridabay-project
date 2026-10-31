ServerConfig = {
    -- staff: /adrev, /adrevnearby, /adresnearby, /purge  (checked through fbrp_core, any of these)
    AdminAces = { 'fbrp.staff.revive.others', 'deathscript.admin' },
    -- medics can always revive with this (fbrp_core: only while on duty with a Fire & EMS department)
    MedicAces = { 'fbrp.ems.revive' },
    -- players with this ace get the shorter respawn timer (e.g. donators)
    FastRespawnAce = 'deathscript.fastrespawn',
    FastRespawnSeconds = 30,
    -- how close a medic / helper has to be (metres)
    InteractDistance = 5.0,
    -- radius for /adrevnearby and /adresnearby when no radius is given
    NearbyRadius = 30.0,
}
