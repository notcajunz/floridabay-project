StaffJailConfig = {}

-- Where staff-jailed players are kept (top of Mount Chiliad - change to your own admin jail spot)
StaffJailConfig.JailSpot = vector4(501.76, 5604.17, 797.91, 175.0)
StaffJailConfig.LeashRadius = 25.0 -- put back if they wander further than this (metres)

-- When released they go back to where they were jailed from. If that's unknown (they relogged), they go here.
StaffJailConfig.FallbackRelease = vector4(195.17, -933.77, 30.69, 145.0) -- Legion Square

-- Staff must be clocked in (/clockin) AND have one of these (fbrp_core staff permissions)
StaffJailConfig.JailAces = { 'fbrp.staff.jail' }
StaffJailConfig.ReleaseAces = { 'fbrp.staff.jail', 'fbrp.staff.release' }

-- Staff can't staff-jail someone with the same or higher staff rank
StaffJailConfig.ProtectHigherRanks = true

-- Time dropdown (minutes) + a custom box in the dialog
StaffJailConfig.TimePresets = { 5, 10, 15, 20, 30, 45, 60, 120, 240 }
StaffJailConfig.DefaultMinutes = 10
StaffJailConfig.MaxMinutes = 1440 -- 24 hours

-- Optional: put the player in a jumpsuit while staff-jailed
StaffJailConfig.UseOutfit = false
StaffJailConfig.Outfit = {
    [`mp_m_freemode_01`] = { [1]={0,0}, [3]={0,0}, [4]={3,7}, [6]={12,12}, [8]={15,0}, [11]={146,0} },
    [`mp_f_freemode_01`] = { [1]={0,0}, [3]={2,0}, [4]={3,15}, [6]={66,5}, [8]={3,0}, [11]={38,3} },
}

StaffJailConfig.NotifyPosition = 'center-right'

-- Optional Discord log: set in server.cfg ->  set fbrp_staffjail_webhook "https://discord.com/api/webhooks/..."
StaffJailConfig.WebhookConvar = 'fbrp_staffjail_webhook'
