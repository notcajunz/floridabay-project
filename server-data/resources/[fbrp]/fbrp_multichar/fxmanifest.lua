fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay'
description 'Character select and register screens (the CodeM mMulticharacter NUI) wired to fbrp_core characters and the MDT. Bridge written by Florida Bay; none of the zip\'s escrowed Lua is used.'
version '1.0.0'

lua54 'yes'

client_scripts {
    'client/config.lua',
    'client/main.lua',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/fbrp.css',
    'html/click.mp3',
    'html/js/*.js',
    'html/images/*.png',
    'html/images/*.svg',
    'html/fonts/*.otf'
}
