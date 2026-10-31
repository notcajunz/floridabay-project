fx_version "cerulean"
games { "gta5" }

author "Jaxtti"
description "FBRP Misc - Developed by Jaxtti (tackle, piggyback, purge broadcast, world limits, misc fixes)"
version "2.0.0"

lua54 "yes"

shared_scripts {
    "@ox_lib/init.lua",
    "config.lua",
}

client_scripts {
    "*_client.lua",
}

server_scripts {
    "*_server.lua",
}
