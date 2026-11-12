fx_version 'cerulean'
version '2.6.5'
games {'gta5'}

this_is_a_map 'yes'

lua54 'yes'

escrow_ignore {
	'stream/amb_rox_props/Flags/*.yft',
	'stream/amb_rox_props/Weaponry/*.ydr',
	'stream/amb_rox_props/Weaponry/*.yft',
	'stream/amb_rox_props/Signs/Editable/*.ydr',
}

file 'stream/amb_rox_props/amb_rox_props.ytyp'
file 'stream/amb_rox_int_props/amb_rox_int_props.ytyp'
file 'stream/amb_rox_props_roadsigns/amb_rox_props_roadsigns.ytyp'

data_file 'DLC_ITYP_REQUEST' 'stream/amb_rox_props/amb_rox_props.ytyp'
data_file 'DLC_ITYP_REQUEST' 'stream/amb_rox_int_props/amb_rox_int_props.ytyp'
data_file 'DLC_ITYP_REQUEST' 'stream/amb_rox_props_roadsigns/amb_rox_props_roadsigns.ytyp'
dependency '/assetpacks'