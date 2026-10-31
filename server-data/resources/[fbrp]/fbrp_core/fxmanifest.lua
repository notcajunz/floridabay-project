fx_version 'cerulean'
game 'gta5'

author 'Florida Bay Roleplay'
description 'Standalone vMenu roleplay systems, pastimes (side jobs, supply drops, street duels, skydiving, achievements), Discord ACE bridge, live operations, community scenes, activities, geocaching, duty, organizations and their economy, tags, interactions, HUD, vehicles, justice and corrections, CAD/MDT, citizen identity and licenses, medical, fishing and exploration, AFK, playtime and launch essentials'
version '1.9.0'

lua54 'yes'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
    'config_systems.lua',
    'config_pastimes.lua'
}

server_scripts {
    -- Legacy vMenu wildcard expansion and voice-permission protection.
    'config_vmenu.lua',
    'config_staffperms.lua',
    -- Vouches for the jail, hospital and escape teleports this resource causes.
    '@corevia_ac/bridge/server.lua',
    '@oxmysql/lib/MySQL.lua',
    'server/database.lua',
    'server/main.lua',
    'server/duty_blips.lua',
    'server/staffperms.lua',
    'server/screenguard.lua',
    'server/characters.lua',
    'server/citizen.lua',
    'server/vehicle_radio.lua',
    'server/radio.lua',
    'server/justice.lua',
    'server/medical.lua',
    'server/life.lua',
    'server/activities.lua',
    'server/scenes.lua',
    'server/economy.lua',
    'server/propertydoors.lua',
    'server/personals.lua',
    'server/pastimes.lua',
    'server/pastime_jobs.lua',
    'server/pastime_events.lua',
    'server/pastime_duels.lua',
    'server/pastime_skydive.lua',
    'server/essentials.lua',
    'server/outfitshare.lua',
    'server/discord_presence.lua'
}

client_scripts {
    '@RageUI/RMenu.lua',
    '@RageUI/menu/RageUI.lua',
    '@RageUI/menu/Menu.lua',
    '@RageUI/menu/MenuController.lua',
    '@RageUI/components/Audio.lua',
    '@RageUI/components/Enum.lua',
    '@RageUI/components/Keys.lua',
    '@RageUI/components/Rectangle.lua',
    '@RageUI/components/Sprite.lua',
    '@RageUI/components/Text.lua',
    '@RageUI/components/Visual.lua',
    '@RageUI/menu/elements/ItemsBadge.lua',
    '@RageUI/menu/elements/ItemsColour.lua',
    '@RageUI/menu/elements/PanelColour.lua',
    '@RageUI/menu/items/UIButton.lua',
    '@RageUI/menu/items/UICheckBox.lua',
    '@RageUI/menu/items/UIList.lua',
    '@RageUI/menu/items/UISeparator.lua',
    '@RageUI/menu/items/UISlider.lua',
    '@RageUI/menu/items/UISliderHeritage.lua',
    '@RageUI/menu/items/UISliderProgress.lua',
    '@RageUI/menu/panels/UIColourPanel.lua',
    '@RageUI/menu/panels/UIGridPanel.lua',
    '@RageUI/menu/panels/UIPercentagePanel.lua',
    '@RageUI/menu/panels/UIStatisticsPanel.lua',
    '@RageUI/menu/windows/UIHeritage.lua',
    'client/main.lua',
    'client/aop.lua',
    'client/duty_blips.lua',
    -- Keeps vMenu's cached NoClip/voice permissions aligned with live duty state.
    'client/vmenu_gate.lua',
    'client/screenguard.lua',
    'client/characters.lua',
    'client/citizen.lua',
    'client/interactions.lua',
    'client/tags.lua',
    'client/population.lua',
    'client/ragdoll.lua',
    'client/vehicles.lua',
    'client/vehicle_failure.lua',
    'client/emergency_vehicles.lua',
    'client/vehicle_radio.lua',
    'client/radio.lua',
    'config_hud.lua',
    'client/hud.lua',
    'client/hud_vehicle.lua',
    'client/hud_minimap.lua',
    'client/hud_postals.lua',
    'client/discord_presence.lua',
    'client/justice.lua',
    'client/medical.lua',
    'client/life.lua',
    'client/activities.lua',
    'client/scenes.lua',
    'client/economy.lua',
    'client/propertydoors.lua',
    'client/personals.lua',
    'client/pastimes.lua',
    'client/pastime_jobs.lua',
    'client/pastime_events.lua',
    'client/pastime_duels.lua',
    'client/pastime_skydive.lua',
    'client/essentials.lua',
    'client/outfitshare.lua',
    'client/announcements.lua'
}

ui_page 'web/index.html'

files {
    'web/index.html',
    'web/styles.css',
    'web/app.js',
    'web/propmenu.js',
    'web/propmenu.css',
    'web/fbrp-logo.png',
    'web/watermark.png',
    'web/hud/index.html',
    'web/hud/style.css',
    'web/hud/app.js',
    'web/hud/sfx/*.mp3',
    'data/postals.json',
    'web/fonts/*.woff2',
    'web/fonts/*.ttf',
    'web/fonts/*.otf',
    'migrations/*.sql'
}

dependency 'oxmysql'
dependency 'ox_lib'
dependency 'RageUI'
dependency 'paradise_vehmenu'
dependency 'fbrp_dpclothing'
-- Starts the character select/register screens with fbrp_core (server.cfg is untracked).
dependency 'fbrp_multichar'

server_export 'IsStaffOnDuty'
server_export 'GetActiveOrganization'
server_export 'HasPermission'
server_export 'GetPlayerDiscord'
server_export 'GetStaffRank'
