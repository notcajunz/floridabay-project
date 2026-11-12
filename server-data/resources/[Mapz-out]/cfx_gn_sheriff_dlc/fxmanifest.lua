fx_version 'cerulean'
game 'gta5'

author 'G&N_s Studio'
description 'Sheriff_Department_DLC'
version '4.2.0'

this_is_a_map 'yes'

dependencies {
    '/gameBuild:2189',
    'cfx_gn_collection'
}

data_file 'TIMECYCLEMOD_FILE' 'gn_sheriff_timecycle.xml'

files {
    'gn_sheriff_timecycle.xml'
}

escrow_ignore {
    'stream/**/*.ytd',
    'stream/unlock_file/**/*.ydr'
}

dependency '/assetpacks'