fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'Johnf350'
description '2020+ Ford F-350 Super Duty 6.7L Powerstroke - realistic handling + rolling coal'
version '1.1.0'

files {
    'data/**/carcols.meta',
    'data/**/carvariations.meta',
    'data/**/handling.meta',
    'data/**/vehiclelayouts.meta',
    'data/**/vehicles.meta',
}

data_file 'VEHICLE_LAYOUTS_FILE'    'data/**/vehiclelayouts.meta'
data_file 'HANDLING_FILE'           'data/**/handling.meta'
data_file 'VEHICLE_METADATA_FILE'   'data/**/vehicles.meta'
data_file 'CARCOLS_FILE'            'data/**/carcols.meta'
data_file 'VEHICLE_VARIATION_FILE'  'data/**/carvariations.meta'

shared_script 'config.lua'
client_script 'client.lua'
