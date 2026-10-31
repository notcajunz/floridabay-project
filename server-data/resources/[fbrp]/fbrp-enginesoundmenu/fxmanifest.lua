fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'Florida Bay Roleplay'
description 'FBRP Engine Sound Menu'
version '1.0.0'

-- Based on the Chroma engine sound menu by Grav. UI, controls and server side rebuilt for FBRP.

shared_script 'config.lua'

client_script 'client.lua'
server_script 'server.lua'

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
    'html/fonts/*.woff',
}
