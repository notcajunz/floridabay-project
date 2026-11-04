------------------------------

fx_version 'adamant'
games { 'gta5' }

author 'TrevorBarns w/ credits see GitHub'
description 'A siren / emergency lights controller for FiveM.'

version '3.2.9'			-- Readonly version of currently installed version.
compatible '3.2.2'		-- Readonly save reverse compatiability.

------------------------------

beta_checking 'false'	-- Stable releases only in production.
experimental 'false'	-- Mute unstable version warning in server console.
debug_mode 'false' 		-- More verbose printing on client console.

------------------------------

ui_page('/UI/html/index.html')

dependencies {
    'RageUI'
}

files({
	-- BASE HUD / AUDIO FILES
	'/UI/html/index.html',
	'/UI/html/lvc.js',
	'/UI/html/style.css',
	'/UI/sounds/Hazards_Off.ogg',
	'/UI/sounds/Hazards_On.ogg',
	'/UI/sounds/Key_Lock.ogg',
	'/UI/sounds/Locked_Press.ogg',
	'/UI/sounds/Cencom/Downgrade.ogg',
	'/UI/sounds/Cencom/Off.ogg',
	'/UI/sounds/Cencom/On.ogg',
	'/UI/sounds/Cencom/Press.ogg',
	'/UI/sounds/Cencom/Release.ogg',
	'/UI/sounds/Cencom/Reminder.ogg',
	'/UI/sounds/Cencom/Upgrade.ogg',
	'/UI/sounds/SSP2000/Downgrade.ogg',
	'/UI/sounds/SSP2000/Off.ogg',
	'/UI/sounds/SSP2000/On.ogg',
	'/UI/sounds/SSP2000/Press.ogg',
	'/UI/sounds/SSP2000/Release.ogg',
	'/UI/sounds/SSP2000/Reminder.ogg',
	'/UI/sounds/SSP2000/Upgrade.ogg',
	'/UI/sounds/SSP3000/Downgrade.ogg',
	'/UI/sounds/SSP3000/Off.ogg',
	'/UI/sounds/SSP3000/On.ogg',
	'/UI/sounds/SSP3000/Press.ogg',
	'/UI/sounds/SSP3000/Release.ogg',
	'/UI/sounds/SSP3000/Reminder.ogg',
	'/UI/sounds/SSP3000/Upgrade.ogg',
	'/UI/sounds/ST300/Downgrade.ogg',
	'/UI/sounds/ST300/Off.ogg',
	'/UI/sounds/ST300/On.ogg',
	'/UI/sounds/ST300/Press.ogg',
	'/UI/sounds/ST300/Release.ogg',
	'/UI/sounds/ST300/Reminder.ogg',
	'/UI/sounds/ST300/Upgrade.ogg',
	'/UI/textures/background.png',
	'/UI/textures/day/horn_off.png',
	'/UI/textures/day/horn_on.png',
	'/UI/textures/day/lock_off.png',
	'/UI/textures/day/lock_on.png',
	'/UI/textures/day/siren_off.png',
	'/UI/textures/day/siren_on.png',
	'/UI/textures/day/slide_off.png',
	'/UI/textures/day/slide_on.png',
	'/UI/textures/day/ta_off.gif',
	'/UI/textures/day/tkd_off.png',
	'/UI/textures/day/tkd_on.png',
	'/UI/textures/night/horn_off.png',
	'/UI/textures/night/horn_on.png',
	'/UI/textures/night/lock_off.png',
	'/UI/textures/night/lock_on.png',
	'/UI/textures/night/siren_off.png',
	'/UI/textures/night/siren_on.png',
	'/UI/textures/night/slide_off.png',
	'/UI/textures/night/slide_on.png',
	'/UI/textures/night/ta_off.gif',
	'/UI/textures/night/tkd_off.png',
	'/UI/textures/night/tkd_on.png',
	'/UI/textures/ta/pattern_1/ta_center.gif',
	'/UI/textures/ta/pattern_1/ta_left.gif',
	'/UI/textures/ta/pattern_1/ta_right.gif',
	'/UI/textures/ta/pattern_2/ta_center.gif',
	'/UI/textures/ta/pattern_2/ta_left.gif',
	'/UI/textures/ta/pattern_2/ta_right.gif',
	'/UI/textures/ta/pattern_3/ta_center.gif',
	'/UI/textures/ta/pattern_3/ta_left.gif',
	'/UI/textures/ta/pattern_3/ta_right.gif',
	'/UI/textures/ta/pattern_4/ta_center.gif',
	'/UI/textures/ta/pattern_4/ta_left.gif',
	'/UI/textures/ta/pattern_4/ta_right.gif',
	'/UI/textures/ta/pattern_5/ta_center.gif',
	'/UI/textures/ta/pattern_5/ta_left.gif',
	'/UI/textures/ta/pattern_5/ta_right.gif',
	'/UI/textures/ta/pattern_6/ta_center.gif',
	'/UI/textures/ta/pattern_6/ta_left.gif',
	'/UI/textures/ta/pattern_6/ta_right.gif',
	'/UI/textures/ta/pattern_7/ta_center.gif',
	'/UI/textures/ta/pattern_7/ta_left.gif',
	'/UI/textures/ta/pattern_7/ta_right.gif',
})


shared_script {
	'/UTIL/semver.lua',
	'/UI/cl_locale.lua',
	'/UI/locale/en.lua', -- Set locale / language file here.
	'SETTINGS.lua',
}

client_scripts {
	---------------RAGE-UI---------------
    "@RageUI/RMenu.lua",
    "@RageUI/menu/RageUI.lua",
    "@RageUI/menu/Menu.lua",
    "@RageUI/menu/MenuController.lua",
    "@RageUI/components/Audio.lua",
    "@RageUI/components/Enum.lua",
    "@RageUI/components/Keys.lua",
    "@RageUI/components/Rectangle.lua",
    "@RageUI/components/Sprite.lua",
    "@RageUI/components/Text.lua",
    "@RageUI/components/Visual.lua",
    "@RageUI/menu/elements/ItemsBadge.lua",
    "@RageUI/menu/elements/ItemsColour.lua",
    "@RageUI/menu/elements/PanelColour.lua",
    "@RageUI/menu/items/UIButton.lua",
    "@RageUI/menu/items/UICheckBox.lua",
    "@RageUI/menu/items/UIList.lua",
    "@RageUI/menu/items/UISeparator.lua",
    "@RageUI/menu/items/UISlider.lua",
    "@RageUI/menu/items/UISliderHeritage.lua",
    "@RageUI/menu/items/UISliderProgress.lua",
    "@RageUI/menu/panels/UIColourPanel.lua",
    "@RageUI/menu/panels/UIGridPanel.lua",
    "@RageUI/menu/panels/UIPercentagePanel.lua",
    "@RageUI/menu/panels/UIStatisticsPanel.lua",
    "@RageUI/menu/windows/UIHeritage.lua",
	-------------------------------------
	'SIRENS.lua',
	'/UTIL/cl_lvc.lua',
	'/UTIL/cl_storage.lua',
	'/UTIL/cl_utils.lua',
	'/UI/cl_audio.lua',
	'/UI/cl_hud.lua',
	'/UI/cl_ragemenu.lua',
}

server_script {
	'/UTIL/sv_lvc.lua',
}
------------------------------
