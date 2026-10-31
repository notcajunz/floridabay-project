fx_version 'cerulean'
game 'gta5'

author 'jaxtti'
description 'Staff car wipe system with ox_lib dialogs, countdown warnings and Discord ACE permissions'
version '1.0.0'

lua54 'yes'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua'
}

client_scripts {
    'client/main.lua'
}

server_scripts {
    'server/main.lua'
}
