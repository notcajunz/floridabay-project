fx_version 'cerulean'
game 'gta5'

name 'FBRP-Sirens'
author 'Florida Bay Roleplay (sounds by Respawn Modifications, made with SirenSharp)'
description 'Florida Bay Roleplay - server sided siren audio (7 packs in one resource)'
version '1.0.0'

files {
	-- 1. Code 3 RLS
	'dlc_code3pack/CODE3RLS.awc',
	'data/code3pack.dat54.rel',
	'data/code3pack.dat54.nametable',
	-- 2. Whelen Gamma 2
	'dlc_whelenpack/WHELENGAMMA2.awc',
	'data/whelenpack.dat54.rel',
	'data/whelenpack.dat54.nametable',
	-- 3. Fire / EMS
	'dlc_fireemspack/FIREEMS.awc',
	'data/fireemspack.dat54.rel',
	'data/fireemspack.dat54.nametable',
	-- 4. Federal Signal PA4000
	'dlc_fedsigpack/FEDSIGPA4000.awc',
	'data/fedsigpack.dat54.rel',
	'data/fedsigpack.dat54.nametable',
	-- 5. DX5 Powercall
	'dlc_dx5pack/dx5.awc',
	'data/dx5pack.dat54.rel',
	'data/dx5pack.dat54.nametable',
	-- 6. Whelen Cencom Sapphire
	'dlc_censapphire/cencomsapphire.awc',
	'data/censapphire.dat54.rel',
	'data/censapphire.dat54.nametable',
	-- 7. Federal Signal Smart Siren
	'dlc_smartsiren/smartsiren.awc',
	'data/smartsiren.dat54.rel',
	'data/smartsiren.dat54.nametable',
}

data_file 'AUDIO_WAVEPACK' 'dlc_code3pack'
data_file 'AUDIO_SOUNDDATA' 'data/code3pack.dat'

data_file 'AUDIO_WAVEPACK' 'dlc_whelenpack'
data_file 'AUDIO_SOUNDDATA' 'data/whelenpack.dat'

data_file 'AUDIO_WAVEPACK' 'dlc_fireemspack'
data_file 'AUDIO_SOUNDDATA' 'data/fireemspack.dat'

data_file 'AUDIO_WAVEPACK' 'dlc_fedsigpack'
data_file 'AUDIO_SOUNDDATA' 'data/fedsigpack.dat'

data_file 'AUDIO_WAVEPACK' 'dlc_dx5pack'
data_file 'AUDIO_SOUNDDATA' 'data/dx5pack.dat'

data_file 'AUDIO_WAVEPACK' 'dlc_censapphire'
data_file 'AUDIO_SOUNDDATA' 'data/censapphire.dat'

data_file 'AUDIO_WAVEPACK' 'dlc_smartsiren'
data_file 'AUDIO_SOUNDDATA' 'data/smartsiren.dat'
