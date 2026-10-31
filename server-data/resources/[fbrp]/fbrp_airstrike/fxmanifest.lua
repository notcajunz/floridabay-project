fx_version 'cerulean'
game 'gta5'

author 'Florida Bay RP'
description 'FBRP Airstrike - /airstrike for Executive Management and above. Derived from mikrolai/FIVEM-Airstrike (GPL-2.0), see NOTICE.md'
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
