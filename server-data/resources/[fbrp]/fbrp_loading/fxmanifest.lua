fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay'
description 'Florida Bay Roleplay interactive loading screen with local and YouTube music playback'
version '3.0.0'

loadscreen 'web/index.html'
loadscreen_cursor 'yes'
-- client.lua closes it once the session starts, so FiveM never swaps in its own
-- dark "bridge" loading layer between this page and gameplay.
loadscreen_manual_shutdown 'yes'

client_script 'client.lua'

files {
    'web/index.html',
    'web/README.txt',
    'web/host-this-online/*.html',
    'web/assets/css/*.css',
    'web/assets/fonts/*.ttf',
    'web/assets/scripts/*.js',
    'web/assets/media/*.png',
    'web/assets/media/icons/*.png',
    'web/assets/media/posters/*.jpg',
    'web/assets/media/music/*.webm',
    -- The website serves this logo too (fbrp-bot web-panel.js).
    'web/assets/fbrp-logo.png'
}
