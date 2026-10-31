fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'jaxtti_lib'
author 'jaxtti'
description 'Utility library for Jaxtti scripts (ox_lib-style API).'
version '1.1.0'

dependencies {
    '/server:7290',
}

files {
    'init.lua',
    'imports/**/client.lua',
    'imports/**/shared.lua',
}

shared_script 'init.lua'

client_scripts {
    'resource/client/cache.lua',
    'resource/client/notify.lua',
}

server_scripts {
    'resource/server/main.lua',
    'resource/server/logger.lua',
}
