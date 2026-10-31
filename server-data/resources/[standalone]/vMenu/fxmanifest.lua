-- Manifest data
fx_version 'cerulean'
games {'gta5'}

-- Resource stuff
name 'vMenu'
description 'Server sided trainer for FiveM with custom permissions, using a custom MenuAPI. More info can be found at www.vespura.com/fivem'
version '3.8.68'
author 'Tom Grobbe'
url 'https://github.com/TomGrobbe/vMenu/'

-- Adds additional logging, useful when debugging issues.
client_debug_mode 'false'
server_debug_mode 'false'

-- Adds extra commands for testing and development
experimental_features_enabled '0'

-- Files & scripts
files {
    'Newtonsoft.Json.dll',
    'MenuAPI.dll',
    'config/*.json'
}

-- Florida Bay RP build: v3.8.68 + patches/vmenu-3.8.68-fbrp (ox_lib notifications, x128 multiplier cap,
-- share codes for saved MP characters). Rebuild with scripts/build-vmenu-fbrp.sh.
dependency 'ox_lib'

client_script 'vMenuClient.net.dll'
server_script 'vMenuServer.net.dll'
