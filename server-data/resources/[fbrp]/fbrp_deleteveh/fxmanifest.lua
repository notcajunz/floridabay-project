fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay'
description 'FBRP /dv - delete the vehicle you are in or the closest one'
version '1.0.0'

lua54 'yes'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
}

client_script 'client.lua'
server_script 'server.lua'

dependency 'ox_lib'
