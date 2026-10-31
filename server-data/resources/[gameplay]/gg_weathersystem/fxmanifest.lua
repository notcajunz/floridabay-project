fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'gg_weathersystem'
author 'GG Studio'
version '1.0.2'
description 'Weather System by GG Studio'

gg_lib_mode 'modules'
gg_lib 'settings'

dependency 'gg_lib'

shared_scripts {
    '@gg_lib/init.lua',
    'schema/shared.lua',
    'core/class.lua',
    'core/lang/shared.lua',
    'core/world/shared.lua',
    'core/world/quake.lua',
    'core/world/meteors.lua',
    'schema/settings.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'core/world/server/store.lua',
    'core/world/server/world.lua',
    'core/world/server/forecast.lua',
    'core/world/server/quakes.lua',
    'core/world/server/strikes.lua',
    'core/world/server/restart.lua',
    'core/panel/server/admin.lua',
    'core/main/server.lua',
    'core/compat/server.lua',
}

client_scripts {
    'core/world/client/timekeeper.lua',
    'core/world/client/grade.lua',
    'core/world/client/bolides.lua',
    'core/world/client/strikes.lua',
    'core/world/client/heavens.lua',
    'core/world/client/nearby.lua',
    'core/world/client/gale.lua',
    'core/world/client/storm.lua',
    'core/world/client/tremors.lua',
    'core/world/client/quake.lua',
    'core/world/client/sky.lua',
    'core/world/client/sync.lua',
    'core/panel/client/panel.lua',
    'core/main/client.lua',
    'core/compat/client.lua',
}

ui_page 'web/dist/index.html'

files {
    'locales/*.json',
    'assets/sky/*.png',
    'web/dist/index.html',
    'web/dist/style.css',
    'web/dist/app.js',
    'web/dist/sky.html',
    'web/dist/sky.js',
    'web/dist/fonts/*.woff2',
}

provide 'qb-weathersync'
provide 'qbx_weathersync'
provide 'cd_easytime'

dependency '/assetpacks'