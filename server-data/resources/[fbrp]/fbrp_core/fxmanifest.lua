fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay'
description 'Standalone vMenu roleplay systems, Discord ACE bridge, live operations, community scenes, duty, organizations, tags, interactions, HUD, vehicles, justice, medical, fishing and exploration'
version '1.3.0'

lua54 'yes'

shared_scripts {
    'config.lua',
    'config_systems.lua'
}

server_scripts {
    -- Vouches for the jail, hospital and escape teleports this resource causes.
    '@corevia_ac/bridge/server.lua',
    '@oxmysql/lib/MySQL.lua',
    'server/database.lua',
    'server/main.lua',
    'server/characters.lua',
    'server/radio.lua',
    'server/justice.lua',
    'server/medical.lua',
    'server/life.lua',
    'server/scenes.lua'
}

client_scripts {
    'client/main.lua',
    'client/characters.lua',
    'client/interactions.lua',
    'client/tags.lua',
    'client/vehicles.lua',
    'client/radio.lua',
    'client/hud.lua',
    'client/justice.lua',
    'client/medical.lua',
    'client/life.lua',
    'client/scenes.lua'
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
