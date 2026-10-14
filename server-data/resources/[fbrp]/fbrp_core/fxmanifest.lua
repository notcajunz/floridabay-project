fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay'
description 'Standalone vMenu roleplay systems, pastimes (side jobs, supply drops, street duels, skydiving, achievements), Discord ACE bridge, live operations, community scenes, activities, geocaching, duty, organizations and their economy, tags, interactions, HUD, vehicles, justice and corrections, CAD/MDT, medical, fishing and exploration'
version '1.6.0'

lua54 'yes'

shared_scripts {
    'config.lua',
    'config_systems.lua',
    'config_pastimes.lua'
}

server_scripts {
    -- Vouches for the jail, hospital and escape teleports this resource causes.
    '@corevia_ac/bridge/server.lua',
    '@oxmysql/lib/MySQL.lua',
    'server/database.lua',
    'server/main.lua',
    'server/screenguard.lua',
    'server/characters.lua',
    'server/radio.lua',
    'server/justice.lua',
    'server/medical.lua',
    'server/life.lua',
    'server/activities.lua',
    'server/scenes.lua',
    'server/economy.lua',
    'server/personals.lua',
    'server/pastimes.lua',
    'server/pastime_jobs.lua',
    'server/pastime_events.lua',
    'server/pastime_duels.lua',
    'server/pastime_skydive.lua'
}

client_scripts {
    'client/main.lua',
    'client/screenguard.lua',
    'client/characters.lua',
    'client/interactions.lua',
    'client/tags.lua',
    'client/vmenu_gate.lua',
    'client/vehicles.lua',
    'client/radio.lua',
    'client/hud.lua',
    'client/justice.lua',
    'client/medical.lua',
    'client/life.lua',
    'client/activities.lua',
    'client/scenes.lua',
    'client/economy.lua',
    'client/personals.lua',
    'client/pastimes.lua',
    'client/pastime_jobs.lua',
    'client/pastime_events.lua',
    'client/pastime_duels.lua',
    'client/pastime_skydive.lua'
}

ui_page 'web/index.html'

files {
    'web/index.html',
    'web/styles.css',
    'web/app.js',
    'web/fbrp-logo.png',
    'web/fonts/*.woff2',
    'migrations/*.sql'
}

dependency 'oxmysql'

server_export 'IsStaffOnDuty'
server_export 'GetActiveOrganization'
server_export 'HasPermission'
server_export 'GetPlayerDiscord'
