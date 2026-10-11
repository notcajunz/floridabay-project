fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'corevia_ac'
author 'QuantiX'
description 'QuantiX Anticheat — server-authoritative anticheat for FiveM'
version '0.4.0'

-- The server half does the detecting. The client half reports what it can see
-- and is never believed on its own: everything it says is a supporting signal
-- that makes the server look harder, and its most useful property is that it
-- stops answering when somebody tampers with it.
server_script 'build/server.js'
client_script 'build/client.js'

-- Constellation live video. Idle - no rendering, no encoding - until the
-- server asks for a stream of this player because a staff member is watching.
ui_page 'ui/live.html'
files {
  'ui/live.html',
}

-- Convars, set in server.cfg:
--   set corevia_api_url "https://cixnservices.xyz"
--   set corevia_token   "cvia_i_..."   (treat as a secret; it is the license)
--   add_ace resource.corevia_ac command.restart allow
--   add_ace resource.corevia_ac command.start allow
--   add_ace resource.corevia_ac command.stop allow
-- Keep both above `ensure corevia_ac`.
