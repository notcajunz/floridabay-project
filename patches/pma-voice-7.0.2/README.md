# pma-voice 7.0.2 upgrade (staged, NOT applied)

Replaces the 2022 v6.6.2 copy in `server-data/resources/[standalone]/pma-voice` with upstream v7.0.2-rc3,
keeping the fbrp tweaks (`fbrp_cycleproximity` command/keymap with F9 default).
Same exports/events fbrp_core uses (addChannelCheck, getPlayersInRadioChannel, setPlayerRadio,
overrideRadioNameGetter, setRadioVolume, pma-voice:radioActive, pma-voice:setTalkingMode) all exist.
`voice.cfg` renames `voice_defaultPhoneVolume` -> `voice_defaultCallVolume`, `voice_enablePhones` -> `voice_enableCalls`.

Apply (from repo root), then restart the game server:

    R="server-data/resources/[standalone]/pma-voice"
    cp -r "$R" /tmp/pma-voice-6.6.2-backup
    rm -rf "$R/client" "$R/server" "$R/ui"
    cp -r patches/pma-voice-7.0.2/{client,server,ui,shared.lua,fxmanifest.lua} "$R"/
    cp patches/pma-voice-7.0.2/voice.cfg server-data/config/voice.cfg

Roll back by restoring the backup folder and `git checkout server-data/config/voice.cfg`.
