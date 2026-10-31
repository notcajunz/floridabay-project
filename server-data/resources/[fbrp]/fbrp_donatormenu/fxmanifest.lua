fx_version 'cerulean'
game 'gta5'

author 'Jaxtti'
description 'FBRP Donator Menu (F6) for Florida Bay Roleplay'
version '2.2.1'

lua54 'yes'

shared_scripts {
	'@ox_lib/init.lua',
}

client_scripts {
	'src/RageUI.lua',
	'src/Menu.lua',
	'src/MenuController.lua',
	'src/components/*.lua',
	'src/elements/*.lua',
	'src/items/*.lua',
	'client/*.lua',
}

server_scripts {
	'@oxmysql/lib/MySQL.lua',
	'server/*.lua',
}

dependencies { 'ox_lib', 'oxmysql' }

use_experimental_fxv2_oal "yes"

files {
	'shared/*.lua',
	'data/*.lua',
	'banner.png',
}
