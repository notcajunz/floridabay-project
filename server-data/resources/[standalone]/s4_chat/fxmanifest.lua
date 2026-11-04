fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'Sakalas'
description 'S4_Chat'
version '0.0.7'

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/**/*',
}

shared_scripts {
    'config.lua',
    'locales/*.lua',
}

client_scripts {
    'client/chat.lua',
    'client/emote.lua',
    'client/editchat.lua',
}

server_scripts {
    'shared/emoji.lua',
    'server/chat.lua',
    'server/commands.lua',
}

escrow_ignore {
    'config.lua',
    'locales/*.lua'
}
dependency '/assetpacks'