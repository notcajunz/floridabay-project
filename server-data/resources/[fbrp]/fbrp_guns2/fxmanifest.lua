fx_version 'cerulean'

games {'gta5'}
author 'Ryan S., Skirata#1227'

files{
	'meta/weaponcomponents_*.meta',
	'meta/weaponarchetypes_*.meta',
	'meta/weaponanimations_*.meta',
	'meta/pedpersonality_*.meta',
	'meta/weapon_*.meta',
}

data_file 'WEAPONCOMPONENTSINFO_FILE' 'meta/weaponcomponents_*.meta'
data_file 'WEAPON_METADATA_FILE' 'meta/weaponarchetypes_*.meta'
data_file 'WEAPON_ANIMATIONS_FILE' 'meta/weaponanimations_*.meta'
data_file 'PED_PERSONALITY_FILE' 'meta/pedpersonality_*.meta'
data_file 'WEAPONINFO_FILE' 'meta/weapon_*.meta'

client_scripts {
	'cl_weaponNames.lua',
	'cl_m203.lua',
}
server_scripts {
	'@oxmysql/lib/MySQL.lua',
	'sv_access.lua',
}

dependencies { 'oxmysql', 'fbrp_core' }
