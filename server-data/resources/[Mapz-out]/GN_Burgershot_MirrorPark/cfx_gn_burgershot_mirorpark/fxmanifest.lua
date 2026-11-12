lua54 'yes'
fx_version 'cerulean'
game 'gta5'

author 'G&N_s Studio'
description 'Miror Park BurgerShot'
version '4.2.0'

this_is_a_map 'yes'

dependencies {
    '/gameBuild:2189',
    'cfx_gn_collection',
    'cfx_gn_burgershot2_dlc'
}

client_script 'gn_bs_mpark_entityset.lua'

escrow_ignore {
    'stream/base/**/*',
    'stream/**/*.ytd'
}

dependency '/assetpacks'