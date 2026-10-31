fx_version 'cerulean'
game 'gta5'

author 'Jaxtti'
description 'FBRP Fuel - gasoline & diesel, real pumps, ox_lib text UI, feeds the fbrp_core HUD fuel gauge'
version '1.0.0'

lua54 'yes'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
}

client_script 'client.lua'
server_script 'server.lua'

dependency 'ox_lib'
