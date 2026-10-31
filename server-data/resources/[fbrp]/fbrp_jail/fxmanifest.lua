fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay'
description 'FBRP Jail - /jail dialog, timed sentences, jail outfit, release by AOP. Uses fbrp_core for duty & permissions.'
version '1.0.0'

lua54 'yes'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
}

client_script 'client.lua'

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua',
}

dependencies {
    'ox_lib',
    'oxmysql',
    'fbrp_core',
}
