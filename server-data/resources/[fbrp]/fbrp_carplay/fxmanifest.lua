fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'carplay'
author 'Saif'
description 'Apple CarPlay style in-car system: YouTube music (xsound), GPS / pins, vehicle dashboard'
version '2.0.0'

shared_script 'config.lua'

client_scripts {
    'client/main.lua',
    'client/gps.lua',
}

server_script 'server/main.lua'

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
    'html/img/*.png',
    'html/img/*.jpg',
    'html/img/*.jpeg',
    'html/img/*.webp',
}

dependency 'xsound'
