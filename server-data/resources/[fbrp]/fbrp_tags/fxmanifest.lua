fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay'
description 'Tag menu (Jaxtti style), overhead headtag/gangtag rendering and LEO/fire ID cards, driven by fbrp_core tag state'
version '2.0.0'

lua54 'yes'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
    'shared/defaults.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua'
}

client_scripts {
    'src/RageUI.lua',
    'src/Menu.lua',
    'src/MenuController.lua',
    'src/components/*.lua',
    'src/elements/*.lua',
    'src/items/*.lua',
    'client/menu.lua',
    'client/functions.lua',
    'client/render.lua',
    'client/idcard.lua'
}

ui_page 'ui/index.html'

files {
    'ui/index.html',
    'ui/styles.css',
    'ui/script.js',
    'ui/img/*.jpeg'
}

dependency 'fbrp_core'
dependency 'ox_lib'
dependency 'oxmysql'
