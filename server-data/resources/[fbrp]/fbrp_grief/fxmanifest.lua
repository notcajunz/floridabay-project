fx_version 'cerulean'
game 'gta5'

author 'Florida Bay RP'
description 'FBRP Grief Menu - /grief for Co-Owner and above while clocked in as staff'
version '1.0.0'

lua54 'yes'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
}
client_scripts {
    '@NativeUI/NativeUI.lua',
    'client.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua',
}

dependencies {
    'oxmysql',
    'ox_lib',
    'NativeUI',
    'fbrp_core',
}
