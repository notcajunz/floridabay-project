fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay compatibility layer'
description 'Database-backed Badger-style Discord role to ACE synchronization'
version '1.0.0'

server_script '@oxmysql/lib/MySQL.lua'
server_script 'server.lua'
dependencies { 'oxmysql', 'Badger_Discord_API' }

