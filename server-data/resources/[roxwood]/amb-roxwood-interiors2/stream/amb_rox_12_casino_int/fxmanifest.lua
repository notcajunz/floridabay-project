fx_version 'cerulean'
game 'gta5'
author 'PF Mods | https://discord.gg/5br3d9Gmuj'
description 'Vinewood Hideout'
version '1.0.0'
lua54 'yes'
this_is_a_map 'yes'

dependencies { 
    '/server:4960',     -- ⚠️PLEASE READ⚠️; Requires at least SERVER build 4960.
    '/gameBuild:2189',  -- ⚠️PLEASE READ⚠️; Requires at least GAME build 2189.
}


files {
    'amb_rox_12_casino.xml',
    'audio/amb_rox_casino_doors_game.dat151.rel'
}

data_file 'TIMECYCLEMOD_FILE'  'amb_rox_12_casino.xml'
data_file 'AUDIO_GAMEDATA'  'audio/amb_rox_casino_doors_game.dat'


escrow_ignore {
    'stream/**/*.ytd',
}

dependency '/assetpacks'
