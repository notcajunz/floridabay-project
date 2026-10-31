fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'jaxtti_core'
author 'jaxtti'
description 'Jaxtti core: links every jaxtti_ resource. Framework bridge (Qbox / QBCore / ESX / standalone), shared config and module loader.'
version '1.0.0'

shared_scripts {
    'config.lua',
    'shared/main.lua',
}

client_scripts {
    'client/bridge.lua',
}

server_scripts {
    'server/bridge.lua',
    'server/main.lua',
}
