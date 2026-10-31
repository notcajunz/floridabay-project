author 'jaxtti'
description 'resource manager for fivem'
version '1.0.0'

fx_version 'cerulean'
game 'gta5'
lua54 'yes'

server_scripts {
    'server/core.lua',
    'server/online.lua',
    'server/connection.lua'
}

client_scripts {
    'client/realchar.lua'
}

shared_script '@ox_lib/init.lua'

dependencies {
    'ox_lib' -- needed to run script :)
}