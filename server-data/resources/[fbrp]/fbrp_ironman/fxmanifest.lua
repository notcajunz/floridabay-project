fx_version 'cerulean'
game 'gta5'

author 'Florida Bay RP'
description 'FBRP Iron Man - Mark 50 suit (replaces ig_bankman) and powers for Co-Owner and above while clocked in as staff'
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

ui_page 'html/index.html'
files {
    'html/index.html',
    'html/sfx/*.wav',
}

dependencies {
    'oxmysql',
    'ox_lib',
    'fbrp_core',
}
