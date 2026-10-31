fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'jaxtti_collision'
author 'jaxtti'
description 'Jaxtti realistic crashes (any framework / standalone): severity-based injuries, seatbelt, ejection, screen and sound effects, vehicle damage'
version '1.0.0'

dependencies { 'jaxtti_core', 'jaxtti_lib' }

shared_scripts { '@jaxtti_lib/init.lua', 'config.lua' }
client_scripts { 'client/effects.lua', 'client/main.lua' }
server_script 'server/main.lua'

ui_page 'web/index.html'
files { 'web/index.html', 'web/sfx/*.mp3' }
