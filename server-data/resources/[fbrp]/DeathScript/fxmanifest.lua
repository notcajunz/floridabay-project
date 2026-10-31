fx_version "cerulean"
games { "gta5" }

author "Jaxtti"
description "Death script for Florida Bay Roleplay - knockouts, deaths, respawns, medic revives and hospitals (uses fbrp_core)"
version "3.0.0"

lua54 "yes"

shared_scripts {
    "@ox_lib/init.lua",
    "config_shared.lua",
}

client_scripts {
    "config_client.lua",
    "functions_client.lua",
    "client.lua",
}

server_scripts {
    "config_server.lua",
    "server.lua",
}

dependencies {
    "ox_lib",
    "fbrp_core",
}
