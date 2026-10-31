fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'Florida Bay RP'
description 'FBRP Mk2 Weapons guard - Mk2 weapons only work for members with the Mk2 Weapons Discord role'
version '1.0.0'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
}
client_script 'client.lua'
server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua',
}

dependencies { 'oxmysql', 'ox_lib' }
