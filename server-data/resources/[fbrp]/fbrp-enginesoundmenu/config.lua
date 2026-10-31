Config = {}

-- ───────────────────────────────────────────────────────────────────────────
--  Florida Bay Roleplay | Engine Sound Menu
-- ───────────────────────────────────────────────────────────────────────────

-- Text in the small header line of the menu.
Config.Header = "FLORIDA BAY | ENGINE SOUND MENU"

-- Used for the few messages shown while the menu is closed (not driving,
-- no permission, /enginesoundstore). Swap in your own notification here.
Config.Notify = function(msg)
    BeginTextCommandThefeedPost("STRING")
    AddTextComponentSubstringPlayerName(msg)
    EndTextCommandThefeedPostTicker(false, false)
end

-- Distance from the bottom-right corner of the screen (pixels at 1080p, scales
-- with resolution). Raise "bottom" if it sits on top of your speedometer HUD.
Config.Position = { right = 34, bottom = 34 }

-- Key that opens/closes the menu. Leave empty ("") to only use /enginesound.
-- Players can also rebind it themselves in Settings > Key Bindings > FiveM.
-- Key names: https://docs.fivem.net/docs/game-references/input-mapper-parameter-ids/keyboard/
Config.Keybind = ""

-- Who may use the menu.
--   nil / false  -> everybody
--   "some.ace"   -> only players with that ACE, e.g. in server.cfg:
--                   add_ace group.donator fbrp.enginesound allow
Config.Permission = nil

-- Remember the last engine sound used per vehicle model and re-apply it when
-- the player gets in as driver. Players can flip this with /enginesoundstore
Config.StoreSoundsByModel = true

-- LVC / siren scripts can make sirens emit sound with lights off if the engine
-- audio is swapped while the siren is running.
Config.BlockWhenSirenOn = true

-- Show the first "Default (vehicle's normal)" entry that puts the stock engine
-- sound back. Set to false if it misbehaves with your add-on vehicles.
Config.AllowDefault = true

-- What audio object a vehicle goes back to when "Default" is applied.
-- By default this is the vehicle's model name, which is right for stock GTA
-- vehicles and for add-ons whose audioNameHash matches their model name.
-- Add exceptions here: ["modelname"] = "audioobjectname"
Config.DefaultAudioOverrides = {
    -- ["myaddoncar"] = "banshee",
}

-- Game controls used while the menu is open (all work while driving).
-- https://docs.fivem.net/docs/game-references/controls/
Config.Controls = {
    left      = 174, -- Arrow Left
    right     = 175, -- Arrow Right
    favourite = 172, -- Arrow Up
    list      = 173, -- Arrow Down
    select    = { 191, 201 }, -- Enter
    close     = { 177 },      -- Backspace
}

-- Engine sound label shown in the menu = audio game object name.
-- The audio packs themselves must be started on the server separately.
Config.EngineSounds = {
        ["BMW S63 4.4L V8"] = "s63b44",
        ["Chevy LT4 6.2L V8SC"] = "chevroletlt4",
        ["Audi 2.1L SOHC I5-T"] = "audi7a",
        ["Ferrari 4.2-4.7L V8"] = "f136",
        ["Mercedes 4.0L V8SC or V8-TT"] = "mercm177",
        ["Ferrari F154 3.9L-V8-TT"] = "f20c",
        ["BMW 5.0L V12"] = "bmws702",
        ["Nissan RB26DETT 2.6L I6-TT #1"] = "rb26dett",
        --["BMW M4 4.4L V8"] = "m4sound",
        ["Bugatti 8.0L W16 Quad Turbo"] = "veyronsound",
        ["Ford 4.6L V8"] = "cvpiv8",
        ["Nissan RB26DETT 2.6L I6-TT #2"] = "bnr34ffeng",
        ["Toyota 2.5-3.0L 1JZ-GTE I6-TT"] = "tjz1eng",
        ["Subaru EJ25 Flat-4 Turbo"] = "wrxrllyeng",
        ["BMW P60B40 4.0L V8"] = "p60b40",
        ["Toyota 4A-GE 1.6L I4"] = "4age",
        ["Ferrari 348 F119 V8"] = "frf119eng",
        ["Cammed Sound Drag Cars"] = "cammedcharger",
        ["Ford Voodoo 5.2L V8"] = "fordvoodoo",
        ["Aston Martin 5.9L V12-TT"] = "aston59v12",
        ["McLaren 3.8 V8-TT"] = "mcp1eng",
        ["Ferrari 2.9-4.0L V6/V8TT"] = "ferrarif154",
        ["Lexus 1LR-GUE 4.8L V10"] = "lfasound",
        ["Nissan SR20DET 2.0L I4-T"] = "nsr2teng",
        ["Audi 5.2L V10-TT"] = "audr8tteng",
        ["McLaren M840T 4.0L V8-TT"] = "ml720v8eng",
        ["Camaro LS3 6.2L V8"] = "camls3v8",
        ["Toyota 2.5-3.0L 2JZ-GTE I6-TT"] = "a80ffeng",
        ["V8 Muscle Cars"] = "lgcy01chargerv8",
        ["Dodge ISB 6.7L V8-T"] = "tacumminsb",
        ["Suzuki GSXR1000"] = "suzukigsxr1k",
        ["VQ35HR 3.5-L V6 Engine"] = "350zsound",
        ["GE Cf6 80c"] = "cf680c",
        ["24v 5.9L Cummins"] = "cummins5924v",
        ["Mitsubishi 2.0 L 4-cylinder"] = "evoixsound",
        ["F-22 Raptor"] = "f119pw100",
        ["Gallardo 5.2 L V10"] = "gallardov10",
        ["2.1L V-Twin Motorcycle"] = "harleysound",
        ["Lamborghini 5.2L V10"] = "lamavgineng",
        ["Dodge V8"] = "nfsv8",
        ["Pratt & Whitney Canada PW200"] = "pw200",
        ["TF34 GE-100/A-10 engine"] = "tf34ge100a",
        ["2 Stroke Dirtbike Sound"] = "2strkbeng",
        ["5.0L V8 Coyote"] = "aq02coyotef150",
        ["6.7L Powerstroke"] = "aq07powerstroke67",
        ["3.8L V6 Vr38dett"] = "aq10nisvr38dett",
        ["3.7L V6 Vq37"] = "aq14nisvq37vhrt",
        ["1.6L Honda I4 B16a"] = "aq21honb16a",
        ["1.8L Honda I4 B18c"] = "aq22honb18c",
        ["2.0L Mitsubishi I4 4b11"] = "aq26mit4b11t",
        ["5.0L Mustang Predator V8"] = "tamustanggt50",
        ["5.0L Mustang Supercharged V8"] = "tascmustanggt50",
        ["1.3L Rotary RX8 renesis"] = "lg15rx8ren",
        ["2.0L Honda k20a"] = "k20a",
        ["2.0L Honda k20c"] = "k20c",
        ["3.6L Ford v6"] = "ecoboostv6",
        ["6.2L Supercharged V8"] = "demonv8",
        ["4.0L Porsche F6"] = "gt3rstun",
        ["H2 Ninja Engine"] = "ta103ninjah2r",
        ["5.9L I6 Dodge Cummins"] = "tacumminsb",
        ["2.0L I4 Honda s2000"] = "f20c",
        ["Rolls Royce Trent 500"] = "trent500",
        ["Suzuki GSXR1000 #2"] = "szkgsxryoshimuraeng",
        ["2 Stroke 250cc Honda"] = "2strkbeng",
        ["2.0L I4 Lancer"] = "n4g63t",
        ["Ducati Panigale V2 VT"] = "panigalevtwinsound",
        ["Lamborghini Murcielago R-SV"] = "gt1murcielagov12sound",
        ["Lamborghini Aventador 6.5LV12"] = "v12lamborghinisound",
        ["HEMI 6.4L V8"] = "chargertrackhawkhemiv8",
        ["Kawasaki Ninja H2"] = "kawasakih2sound",
        ["Koenigsegg Agera RSV8"] = "agerasound",
        ["Twin-Turbocharged 4.0L V8"] = "ea825",
        ["GTA5 Police Bike"] = "policeb",
        ["Default GTA5 Car"] = "btype2",
        ["lg103gomrs2"] = "lg103gomrs2",
        ["lg109trxvipe"] = "lg109trxvipe",
        ["lg152gomcgt"] = "lg152gomcgt",
        ["lg153gom70stang"] = "lg153gom70stang",
        ["lg161gomtcsrt8"] = "lg161gomtcsrt8",
        ["lg171gomaltimaniac"] = "lg171gomaltimaniac",
        ["lg186teslaev"] = "lg186teslaev",
        ["lg197gomptam"] = "lg197gomptam",
        ["lg247hemi57"] = "lg247hemi57",
        ["lg90gomevo37"] = "lg90gomevo37",
        ["lgccl02gomcharger"] = "lgccl02gomcharger",
        ["lgcl04gomstangrtr"] = "lgcl04gomstangrtr",
        ["Pagani-AMG M297 7.3L V12"] = "m297zonda",
        ["Predator 5.2L V8SC"] = "predatorv8",
        ["Mazda RX-7 13B"] = "rx7bpeng",
        ["2.0L Subaru EJ20"] = "subaruej20",
        ["6.2L V8 Ram TRX"] = "lg109trxviper",
        ["4.0L Mercedes AMG"] = "lg162gomtcev",
        ["6.2L Escalade V8"] = "lg211gomescaladev",
        ["3.5L TwinTurbo Ecoboost V6"] = "ttecov6",
        ['Hellcat Redeye V8'] = 'lg81hcredeye',
        ["Turbo Cammed V12"] = "pturbosbc",
        ["NOS V6 Cammed Mitsubishi"] = "plsnitrous",
        ["V16 8.2L Cammed Ram"] = "psbfn",
        ["Race Swap Cammed V8"] = "aqls7raceswap",
        ["4.0L V6 Turbo"] = "bmws1krreng",
        ["6.2L V8 Supercharged Demon"] = "superchargerdemonv8"
}
