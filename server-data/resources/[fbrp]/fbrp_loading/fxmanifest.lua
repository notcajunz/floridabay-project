fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay'
description 'Florida Bay Roleplay branded loading screen'
version '1.0.0'

loadscreen 'web/index.html'
loadscreen_cursor 'yes'
-- client.lua closes it once the session starts, so FiveM never swaps in its own
-- dark "bridge" loading layer between this page and gameplay.
loadscreen_manual_shutdown 'yes'

client_script 'client.lua'

files {
    'web/index.html',
    'web/styles.css',
    'web/loading.js',
    'web/assets/fbrp-logo.png',
    'web/assets/florida-bay-night-drive.ogg'
}

