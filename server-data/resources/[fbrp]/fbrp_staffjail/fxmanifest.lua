fx_version 'cerulean'
game 'gta5'

author 'Jaxtti'
description 'FBRP Staff Jail - /staffjail dialog for clocked-in staff (fbrp_core /clockin), timed, saved, logged'
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
