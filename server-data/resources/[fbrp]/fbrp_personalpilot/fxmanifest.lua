fx_version 'cerulean'
game 'gta5'

author 'Florida Bay RP'
description 'Staff personal pilot with waypoint runway landings for Trial Management and above'
version '1.0.0'

lua54 'yes'

shared_script 'config.lua'
client_script 'client.lua'

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua',
}

dependencies {
    'oxmysql',
    'fbrp_core',
}
