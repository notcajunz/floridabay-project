JailConfig = {}

-- Everyone who is jailed is put here, every time.
JailConfig.JailSpot = vector4(1638.4463, 2524.6267, 45.5648, 326.0710)

-- How far an inmate can wander from the jail spot before being put back (metres).
JailConfig.LeashRadius = 130.0

-- Optional per-AOP release spots (GlobalState 'fbrp:aop' from fbrp_core): the first entry whose `match` words
-- appear in the AOP name is used, otherwise DefaultRelease. Currently empty, so everyone is released at DefaultRelease.
-- Heights are snapped to the ground on release, so a slightly-off Z is fine.
JailConfig.ReleaseSpots = {} -- every release uses DefaultRelease below, whatever the AOP
JailConfig.DefaultRelease = { label = 'the prison gate', coords = vector4(1857.0015, 2600.5117, 45.6720, 288.8060) }

-- Permissions (checked through fbrp_core, so police only count while on /duty with a law enforcement department)
JailConfig.JailAces = { 'fbrp.police.jail', 'fbrp.staff.jail' }
JailConfig.ReleaseAces = { 'fbrp.police.jail', 'fbrp.staff.release' }
JailConfig.CheckOthersAces = { 'fbrp.police.jail', 'fbrp.staff.jail' } -- may use /checkjailtime <id>
JailConfig.StaffAces = { 'fbrp.staff.jail' }                            -- skip the distance check below

-- 0 = jail anyone by ID from anywhere. Set e.g. 15.0 to make officers stand near the suspect (staff are exempt).
JailConfig.MaxDistance = 0

-- Jail time dropdown (minutes) + a custom field in the dialog
JailConfig.TimePresets = { 1, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120 }
JailConfig.DefaultMinutes = 10
JailConfig.MaxMinutes = 240

JailConfig.NotifyPosition = 'center-right'

-- Jail outfit (component = { drawable, texture }). Taken off again on release.
JailConfig.Jumpsuit = {
    [`mp_m_freemode_01`] = { [1]={0,0}, [3]={0,0}, [4]={3,7}, [6]={12,12}, [8]={15,0}, [11]={146,0} },
    [`mp_f_freemode_01`] = { [1]={0,0}, [3]={2,0}, [4]={3,15}, [6]={66,5}, [8]={3,0}, [11]={38,3} },
}
