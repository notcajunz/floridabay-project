fx_version 'cerulean'
game 'gta5'

author 'G&N_s Studio'
description 'BurgerShot - DLC Int 02'
version '4.2.0'

this_is_a_map 'yes'

dependencies {
    '/gameBuild:2189',
    'cfx_gn_collection'
}

data_file 'TIMECYCLEMOD_FILE' 'gn_burgershot_timecycle.xml'

files {
    'gn_burgershot_timecycle.xml'
}

escrow_ignore {
    'stream/**/*.ytd'
}

dependency '/assetpacks'