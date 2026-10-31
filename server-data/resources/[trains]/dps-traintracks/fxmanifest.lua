fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'dps-traintracks'
description 'Registers the Roxwood shuttle as train track 12 so dps-trains can run it'
version '1.0.0'

files {
    'traintracks.xml',
    'trains12.dat',
}

-- The game's data file type for extra train tracks. dps-trains' notes spell it TRAINTRACK_FILE in one place and
-- TRAINTRACKS_FILE in another, so both are declared; the one the game does not know is ignored. Check with
-- the dps-trains /trackprobe command: track 12 should report 335 nodes.
data_file 'TRAINTRACK_FILE' 'traintracks.xml'
data_file 'TRAINTRACKS_FILE' 'traintracks.xml'
