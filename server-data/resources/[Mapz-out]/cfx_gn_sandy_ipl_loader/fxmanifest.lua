fx_version 'cerulean'
lua54 'yes'
game 'gta5'

author 'G&Ns Studio'
description 'G&Ns Studio Sandy Shores IPL Loader'
version '4.1.3'


client_scripts {
    'config.lua',
    'client/ipl_config.lua',
    'client/entityset_config.lua',
    'client/main.lua',
    'client/ipl_poollsize_patch.lua'
}

escrow_ignore {
    'config.lua',
    'client/ipl_poollsize_patch.lua'
}
dependency '/assetpacks'