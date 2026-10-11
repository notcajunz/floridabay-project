fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay compatibility layer'
description 'MariaDB-backed compatibility exports for resources expecting Badger_Discord_API'
version '1.0.0'

server_script '@oxmysql/lib/MySQL.lua'
server_script 'server.lua'
dependency 'oxmysql'

server_exports {
    'GetDiscordRoles',
    'ClearCache',
    'CheckEqual',
    'FetchRoleID',
    'GetRoleIdFromRoleName',
    'GetDiscordName',
    'GetDiscordNickname',
    'GetDiscordAvatar',
    'GetGuildRoleList'
}

