fx_version 'cerulean'
game 'gta5'
lua54 'yes'

description 'Sandy Shores Liquor Bar'
author 'G&Ns Studio'
version '4.0.0'

this_is_a_map 'yes'

dependencies {
    'cfx_gn_collection',
    'cfx_gn_sandy_mapdata'
}

data_file 'TIMECYCLEMOD_FILE' 'gn_sandy_liquorbar_timecycles.xml'

files {
    'gn_sandy_liquorbar_timecycles.xml'
}

client_script {
    'gn_ss_liquorbar_entityset.lua'
}

escrow_ignore {
    'stream/base/**/*',
    'gn_ss_liquorbar_entityset.lua',
}


dependency '/assetpacks'