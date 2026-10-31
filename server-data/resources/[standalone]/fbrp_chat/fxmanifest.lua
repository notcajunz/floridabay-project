fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'fbrp_chat'
author 'Florida Bay Roleplay'
description 'Florida Bay chat: replaces the cfx chat resource. Themed chat UI (minimal / cards / iMessage), role badges, OOC, /me /do, social, SMS, staff and LEO commands. Staff, LEO and chat tags come from fbrp_core.'
version '2.0.0'

-- stands in for the default cfx `chat` resource, so scripts that depend on `chat` keep working
provide 'chat'

dependencies { 'ox_lib' }

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
}
client_script 'client/main.lua'
server_scripts {
    'server/main.lua',
    'server/commands.lua',
}

ui_page 'web/index.html'
files {
    'web/index.html',
    'web/style.css',
    'web/app.js',
    'web/seasons.js',
}

nui_callback_strict_mode 'true'
