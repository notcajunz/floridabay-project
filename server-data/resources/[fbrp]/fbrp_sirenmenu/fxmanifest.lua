fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'fbrp_sirenmenu'
author 'Florida Bay Roleplay'
description 'Florida Bay Roleplay - Siren Menu for LVC (standalone UI, no ox_lib needed)'
version '2.4.0'

client_scripts {
    'client_config.lua',
    'client.lua',
}

server_scripts {
    'server.lua',
}

ui_page 'ui/index.html'

files {
    'ui/index.html',
    'ui/logo.png',
}

dependencies {
    'lvc',
}
