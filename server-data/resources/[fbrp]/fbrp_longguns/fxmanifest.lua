fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'Florida Bay Roleplay'
description 'Long guns come out of vehicle trunks via the weapon wheel only; sling them on the back or chest. Pistols and melee are unrestricted.'
version '1.0.0'

shared_script 'config.lua'

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua'
}

client_script 'client/main.lua'

dependency 'oxmysql'
