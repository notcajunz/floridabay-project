SharedConfig = {
    -- Beds players are put in when they get treated at a hospital worker.
    -- These are for the El Burro Heights and Paleto hospital MLOs - change them to the hospitals your server has.
    hospitalBeds = {
        ["El Burro Hospital"] = {
            { 1124.75, -1563.14,  34.59, 1.52 },
            { 1121.33, -1563.125, 34.59, 1.52 },
            { 1117.87, -1563.127, 34.59, 1.52 },
            { 1117.83, -1554.57,  34.59, 180.0 },
            { 1121.36, -1554.54,  34.59, 180.0 },
            { 1124.82, -1554.57,  34.59, 180.0 },
            -- hallway beds
            { 1129.76, -1552.57,  34.59, 2.0 },
            { 1133.41, -1569.32,  34.60, 180.0 },
        },
        ["Paleto Hospital"] = {
            { -244.22, 6317.58, 32.01, 49.16 },
            { -247.68, 6314.12, 32.01, 49.16 },
            { -251.43, 6310.38, 32.01, 49.16 },
            { -255.03, 6306.78, 32.01, 49.16 },
            { -263.55, 6313.75, 32.31, 313.3 },
        },
    },
    medic = {
        -- fbrp_core organisation types that count as medics while on /duty (fire = Fire & EMS)
        orgTypes = { fire = true },
        -- headtag / gangtag labels that also count as medics (exact label text from the tag menu)
        tags = { 'SAFD', 'S.W.A.T. Medic', 'DOD Fire Department', 'Metro PD | Search & Rescue' },
    },
}
