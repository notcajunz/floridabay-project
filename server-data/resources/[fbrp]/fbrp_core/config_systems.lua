-- Justice, medical and civilian-life systems. Shared so the client can show the
-- same penal code, prison layout and emote list the server validates against.

FBRP.Justice = {
    secondsPerMonth = 30,        -- online time served per sentenced month
    maxMonths = 90,
    workReductionSeconds = 45,   -- each prison job knocks this much off the remaining time
    workMinimumRemaining = 30,   -- prison work never takes a sentence below this
    workHoldMs = 9000,
    workCooldownSeconds = 15,
    escapeEnabled = true,
    escapeHoldMs = 45000,
    escapeMinPolice = 1,         -- on-duty officers that must be online for a breakout
    escapePenaltyMonths = 25,    -- added to the next sentence of an escaped inmate
    citationMaxFine = 10000,
    spikeLifetimeSeconds = 180,
    gsrMinutes = 20,
    prison = {
        name = 'Bolingbroke Penitentiary',
        center = vector3(1693.33, 2569.51, 45.55),
        leashRadius = 130.0,
        spawns = {
            vector4(1661.046, 2524.681, 45.564, 260.545),
            vector4(1650.812, 2540.582, 45.564, 230.436),
            vector4(1654.959, 2545.535, 45.564, 230.436),
            vector4(1697.106, 2525.558, 45.564, 187.208),
            vector4(1673.084, 2519.823, 45.564, 229.542),
        },
        release = vector4(1848.13, 2586.05, 45.67, 269.5),
        work = {
            vector4(1761.46, 2540.41, 45.56, 272.25),
            vector4(1718.54, 2527.80, 45.56, 272.25),
            vector4(1700.20, 2474.81, 45.56, 272.25),
            vector4(1664.83, 2501.58, 45.56, 272.25),
            vector4(1621.62, 2509.30, 45.56, 272.25),
            vector4(1627.94, 2538.39, 45.56, 272.25),
        },
        escapeSpot = vector3(1625.10, 2575.99, 45.56),
        escapeExit = vector4(1468.0, 2560.0, 50.0, 90.0),
    },
}

-- Charges offered by the sentencing and citation forms. Fines are roleplay
-- amounts only: Florida Bay has no economy.
FBRP.PenalCode = {
    { id='speeding', title='Speeding', kind='infraction', months=0, fine=150 },
    { id='reckless', title='Reckless driving', kind='infraction', months=0, fine=500 },
    { id='redlight', title='Running a red light', kind='infraction', months=0, fine=200 },
    { id='yield', title='Failure to yield', kind='infraction', months=0, fine=250 },
    { id='nolicense', title='Driving without a license', kind='infraction', months=0, fine=350 },
    { id='parking', title='Illegal parking', kind='infraction', months=0, fine=75 },
    { id='noise', title='Noise violation', kind='infraction', months=0, fine=100 },
    { id='jaywalk', title='Jaywalking', kind='infraction', months=0, fine=50 },
    { id='trespass', title='Trespassing', kind='misdemeanor', months=5, fine=300 },
    { id='disorderly', title='Disorderly conduct', kind='misdemeanor', months=5, fine=250 },
    { id='theft', title='Petty theft', kind='misdemeanor', months=8, fine=500 },
    { id='vandalism', title='Vandalism', kind='misdemeanor', months=6, fine=400 },
    { id='resisting', title='Resisting arrest', kind='misdemeanor', months=10, fine=0 },
    { id='obstruction', title='Obstruction of justice', kind='misdemeanor', months=10, fine=0 },
    { id='brandishing', title='Brandishing a firearm', kind='misdemeanor', months=10, fine=1000 },
    { id='footevade', title='Evading police on foot', kind='misdemeanor', months=8, fine=0 },
    { id='dui', title='Driving under the influence', kind='misdemeanor', months=12, fine=1000 },
    { id='gta', title='Grand theft auto', kind='felony', months=15, fine=0 },
    { id='evading', title='Evading police in a vehicle', kind='felony', months=20, fine=0 },
    { id='firearm', title='Possession of an illegal firearm', kind='felony', months=15, fine=0 },
    { id='trafficking', title='Drug trafficking', kind='felony', months=30, fine=0 },
    { id='robbery', title='Armed robbery', kind='felony', months=25, fine=0 },
    { id='adw', title='Assault with a deadly weapon', kind='felony', months=25, fine=0 },
    { id='leoassault', title='Assault on a law enforcement officer', kind='felony', months=30, fine=0 },
    { id='kidnapping', title='Kidnapping', kind='felony', months=30, fine=0 },
    { id='attempted', title='Attempted murder', kind='felony', months=40, fine=0 },
    { id='murder', title='Murder', kind='felony', months=60, fine=0 },
    { id='escape', title='Prison escape', kind='felony', months=25, fine=0 },
}

FBRP.Medical = {
    bleedoutSeconds = 180,
    downedHealth = 120,
    respawnHoldMs = 3000,
    distressCooldownSeconds = 60,
    reviveMs = 6000,
    hospitals = {
        { id='pillbox', label='Pillbox Hill Medical Center', coords=vector4(298.68, -584.48, 43.26, 70.0) },
        { id='sandy', label='Sandy Shores Medical Center', coords=vector4(1839.60, 3672.90, 34.28, 210.0) },
        { id='paleto', label='Paleto Bay Medical Center', coords=vector4(-247.76, 6331.23, 32.43, 225.0) },
    },
}

-- /e and the F3 emote menu. Scenarios bring their own props; animations can
-- attach up to two props of their own.
FBRP.Emotes = {
    { id='wave', label='Wave', cat='Gestures', dict='friends@frj@ig_1', anim='wave_a', flag=49 },
    { id='salute', label='Salute', cat='Gestures', dict='anim@mp_player_intincarsalutestd@ds@', anim='idle_a', flag=49 },
    { id='thumbsup', label='Thumbs up', cat='Gestures', dict='anim@mp_player_intincarthumbs_upstd@ds@', anim='idle_a', flag=49 },
    { id='facepalm', label='Facepalm', cat='Gestures', dict='anim@mp_player_intcelebrationmale@face_palm', anim='face_palm', flag=48 },
    { id='shrug', label='Shrug', cat='Gestures', dict='gestures@f@standing@casual', anim='gesture_shrug_hard', flag=48 },
    { id='no', label='Shake head', cat='Gestures', dict='gestures@m@standing@casual', anim='gesture_head_no', flag=48 },
    { id='crossarms', label='Cross arms', cat='Gestures', dict='amb@world_human_hang_out_street@female_arms_crossed@base', anim='base', flag=49 },
    { id='think', label='Think', cat='Gestures', dict='misscarsteal4@aliens', anim='rehearsal_base_idle_director', flag=49 },
    { id='clap', label='Cheer', cat='Gestures', scenario='WORLD_HUMAN_CHEERING' },
    { id='impatient', label='Impatient', cat='Gestures', scenario='WORLD_HUMAN_STAND_IMPATIENT' },

    { id='sit', label='Sit on ground', cat='Rest', scenario='WORLD_HUMAN_PICNIC' },
    { id='lean', label='Lean on wall', cat='Rest', scenario='WORLD_HUMAN_LEANING' },
    { id='sunbathe', label='Lie on back', cat='Rest', scenario='WORLD_HUMAN_SUNBATHE_BACK' },
    { id='slumped', label='Slumped', cat='Rest', scenario='WORLD_HUMAN_BUM_SLUMPED' },
    { id='hangout', label='Hang out', cat='Rest', scenario='WORLD_HUMAN_HANG_OUT_STREET' },
    { id='kneel', label='Kneel, hands on head', cat='Rest', dict='random@arrests@busted', anim='idle_a', flag=1 },
    { id='dead', label='Play dead', cat='Rest', dict='dead', anim='dead_a', flag=1 },

    { id='phone', label='Phone call', cat='Props', dict='cellphone@', anim='cellphone_call_listen_base', flag=49,
      props={ { model='prop_npc_phone_02', bone=28422, pos={0.0,0.0,0.0}, rot={0.0,0.0,0.0} } } },
    { id='text', label='Texting', cat='Props', scenario='WORLD_HUMAN_STAND_MOBILE' },
    { id='notepad', label='Notepad', cat='Props', dict='missheistdockssetup1clipboard@base', anim='base', flag=49,
      props={ { model='prop_notepad_01', bone=18905, pos={0.1,0.02,0.05}, rot={10.0,0.0,0.0} },
              { model='prop_pencil_01', bone=58866, pos={0.11,-0.02,0.001}, rot={-120.0,0.0,0.0} } } },
    { id='clipboard', label='Clipboard', cat='Props', scenario='WORLD_HUMAN_CLIPBOARD' },
    { id='coffee', label='Coffee', cat='Props', scenario='WORLD_HUMAN_AA_COFFEE' },
    { id='smoke', label='Smoke', cat='Props', scenario='WORLD_HUMAN_SMOKING' },
    { id='beer', label='Beer', cat='Props', scenario='WORLD_HUMAN_PARTYING' },
    { id='box', label='Carry box', cat='Props', dict='anim@heists@box_carry@', anim='idle', flag=49,
      props={ { model='hei_prop_heist_box', bone=60309, pos={0.025,0.08,0.255}, rot={-145.0,290.0,0.0} } } },
    { id='umbrella', label='Umbrella', cat='Props', dict='amb@world_human_drinking@coffee@male@base', anim='base', flag=49,
      props={ { model='p_amb_brolly_01', bone=57005, pos={0.15,0.005,0.0}, rot={87.0,-20.0,180.0} } } },
    { id='rose', label='Rose', cat='Props', dict='anim@heists@humane_labs@finale@keycards', anim='ped_a_enter_loop', flag=49,
      props={ { model='prop_single_rose', bone=18905, pos={0.13,0.15,0.0}, rot={-100.0,0.0,-20.0} } } },
    { id='map', label='Read map', cat='Props', scenario='WORLD_HUMAN_TOURIST_MAP' },
    { id='binoculars', label='Binoculars', cat='Props', scenario='WORLD_HUMAN_BINOCULARS' },
    { id='camera', label='Take photos', cat='Props', scenario='WORLD_HUMAN_PAPARAZZI' },
    { id='film', label='Film on phone', cat='Props', scenario='WORLD_HUMAN_MOBILE_FILM_SHOOTING' },
    { id='guitar', label='Guitar', cat='Props', scenario='WORLD_HUMAN_MUSICIAN' },

    { id='cop', label='Cop idle', cat='Work', scenario='WORLD_HUMAN_COP_IDLES' },
    { id='guard', label='Guard stance', cat='Work', scenario='WORLD_HUMAN_GUARD_STAND' },
    { id='traffic', label='Direct traffic', cat='Work', scenario='WORLD_HUMAN_CAR_PARK_ATTENDANT' },
    { id='investigate', label='Inspect ground', cat='Work', scenario='CODE_HUMAN_MEDIC_KNEEL' },
    { id='torch', label='Flashlight', cat='Work', scenario='WORLD_HUMAN_SECURITY_SHINE_TORCH' },
    { id='cpr', label='CPR', cat='Work', dict='mini@cpr@char_a@cpr_str', anim='cpr_pumpchest', flag=1 },
    { id='mechanic', label='Under vehicle', cat='Work', scenario='WORLD_HUMAN_VEHICLE_MECHANIC' },
    { id='weld', label='Weld', cat='Work', scenario='WORLD_HUMAN_WELDING' },
    { id='hammer', label='Hammer', cat='Work', scenario='WORLD_HUMAN_HAMMERING' },
    { id='drill', label='Jackhammer', cat='Work', scenario='WORLD_HUMAN_CONST_DRILL' },
    { id='sweep', label='Sweep', cat='Work', scenario='WORLD_HUMAN_JANITOR' },
    { id='clean', label='Wipe down', cat='Work', scenario='WORLD_HUMAN_MAID_CLEAN' },
    { id='garden', label='Garden', cat='Work', scenario='WORLD_HUMAN_GARDENER_PLANT' },
    { id='bbq', label='Grill', cat='Work', scenario='PROP_HUMAN_BBQ' },

    { id='pushups', label='Push-ups', cat='Fitness', scenario='WORLD_HUMAN_PUSH_UPS' },
    { id='situps', label='Sit-ups', cat='Fitness', scenario='WORLD_HUMAN_SIT_UPS' },
    { id='yoga', label='Yoga', cat='Fitness', scenario='WORLD_HUMAN_YOGA' },
    { id='flex', label='Flex', cat='Fitness', scenario='WORLD_HUMAN_MUSCLE_FLEX' },
    { id='jog', label='Jog in place', cat='Fitness', scenario='WORLD_HUMAN_JOG_STANDING' },

    { id='dance', label='Club dance', cat='Dance', dict='anim@amb@nightclub@dancers@crowddance_facedj@hi_intensity', anim='hi_dance_facedj_09_v2_male^1', flag=1 },
    { id='dance2', label='Solo dance', cat='Dance', dict='anim@amb@nightclub@mini@dance@dance_solo@male@var_a@', anim='high_center', flag=1 },
    { id='dance3', label='Groove', cat='Dance', dict='anim@amb@nightclub@mini@dance@dance_solo@female@var_a@', anim='high_center', flag=1 },
    { id='statue', label='Statue', cat='Dance', scenario='WORLD_HUMAN_HUMAN_STATUE' },
}

FBRP.Fishing = {
    castMinimumMs = 6000,
    biteMinMs = 6000,
    biteMaxMs = 18000,
    -- Fresh water; everywhere else around Florida Bay is salt.
    freshwater = {
        { minX=0.0, maxX=2600.0, minY=3550.0, maxY=4800.0 },   -- Alamo Sea
        { minX=1500.0, maxX=2300.0, minY=-300.0, maxY=600.0 }, -- Land Act Reservoir
    },
    rarity = {
        junk = { weight=8, color='#93a3ab' },
        common = { weight=55, color='#eef3f5' },
        uncommon = { weight=25, color='#4fe08c' },
        rare = { weight=9, color='#6fa8ff' },
        epic = { weight=2.6, color='#c48bff' },
        legendary = { weight=0.4, color='#ffb547' },
    },
    species = {
        { name='Old Boot', water='any', rarity='junk', min=1.0, max=3.0 },
        { name='Rusty Can', water='any', rarity='junk', min=0.2, max=0.8 },
        { name='Spotted Seatrout', water='salt', rarity='common', min=1.0, max=6.0 },
        { name='Sheepshead', water='salt', rarity='common', min=1.0, max=8.0 },
        { name='Mangrove Snapper', water='salt', rarity='common', min=1.0, max=6.0 },
        { name='Red Drum', water='salt', rarity='uncommon', min=4.0, max=30.0 },
        { name='Snook', water='salt', rarity='uncommon', min=3.0, max=25.0 },
        { name='Mahi-Mahi', water='salt', rarity='uncommon', min=8.0, max=40.0 },
        { name='Red Grouper', water='salt', rarity='uncommon', min=5.0, max=25.0 },
        { name='Barracuda', water='salt', rarity='rare', min=8.0, max=45.0 },
        { name='Tarpon', water='salt', rarity='rare', min=30.0, max=150.0 },
        { name='Sailfish', water='salt', rarity='epic', min=40.0, max=100.0 },
        { name='Goliath Grouper', water='salt', rarity='legendary', min=150.0, max=450.0 },
        { name='Bluegill', water='fresh', rarity='common', min=0.2, max=1.2 },
        { name='Black Crappie', water='fresh', rarity='common', min=0.5, max=2.5 },
        { name='Channel Catfish', water='fresh', rarity='common', min=2.0, max=20.0 },
        { name='Largemouth Bass', water='fresh', rarity='uncommon', min=1.0, max=12.0 },
        { name='Peacock Bass', water='fresh', rarity='rare', min=2.0, max=9.0 },
        { name='Alligator Gar', water='fresh', rarity='epic', min=30.0, max=150.0 },
        { name='Lake Monster Catfish', water='fresh', rarity='legendary', min=60.0, max=120.0 },
    },
}

-- The Coastal Passport turns the map itself into a long-running activity. A
-- player discovers each stop by physically visiting it; the server validates
-- the distance and persists the stamp. Daily goals deliberately overlap with
-- normal roleplay (exploration and fishing) instead of creating an economy.
FBRP.Passport = {
    discoveryRadius = 38.0,
    nearbyRadius = 110.0,
    discoveryPoints = 100,
    featuredBonus = 50,
    ranks = {
        { points=0, label='New Arrival' },
        { points=300, label='Coast Wanderer' },
        { points=700, label='Bay Pathfinder' },
        { points=1200, label='Florida Local' },
        { points=1900, label='Coastal Legend' },
    },
    dailyGoals = {
        { id='tour', label='Coastal Tour', description='Stamp 2 new passport stops', target=2, reward=125, icon='pin' },
        { id='angler', label='Tight Lines', description='Land 3 fish', target=3, reward=75, icon='fish' },
        { id='rare', label='Rare Find', description='Land an uncommon-or-better fish', target=1, reward=100, icon='sparkles' },
    },
    landmarks = {
        { id='del_perro', label='Del Perro Pier', region='Los Santos', lore='Neon, salt air, and the city skyline at your back.', x=-1847.2, y=-1195.8, z=19.2 },
        { id='observatory', label='Galileo Observatory', region='Vinewood Hills', lore='The whole basin opens beneath the domes.', x=-438.7, y=1075.0, z=352.4 },
        { id='vinewood', label='Vinewood Sign', region='Vinewood Hills', lore='A postcard view from above the letters.', x=741.3, y=1200.5, z=325.2 },
        { id='sandy_airfield', label='Sandy Airfield', region='Blaine County', lore='Dust, hangars, and stories waiting to take off.', x=1747.0, y=3273.7, z=41.1 },
        { id='alamo', label='Alamo Sea Lookout', region='Blaine County', lore='The inland sea at its quietest edge.', x=1304.3, y=4227.4, z=33.9 },
        { id='quarry', label='Davis Quartz', region='Grand Senora', lore='An industrial canyon cut into the desert.', x=2956.4, y=2787.2, z=41.5 },
        { id='paleto_pier', label='Paleto Pier', region='Paleto Bay', lore='The north coast where the mountains meet the Pacific.', x=-278.1, y=6638.7, z=7.5 },
        { id='chiliad', label='Mount Chiliad Summit', region='San Andreas', lore='The highest stamp in the passport.', x=450.2, y=5566.1, z=806.2 },
        { id='lighthouse', label='El Gordo Lighthouse', region='East Coast', lore='A lonely beacon above the eastern surf.', x=3315.4, y=5175.0, z=18.6 },
        { id='tongva', label='Tongva Falls', region='Tongva Hills', lore='A hidden ribbon of water beyond the vineyards.', x=-1577.7, y=2102.7, z=67.6 },
    },
}

function FBRP.FindLandmark(id)
    for _, landmark in ipairs(FBRP.Passport.landmarks) do
        if landmark.id == id then return landmark end
    end
end

function FBRP.FindCharge(id)
    for _, charge in ipairs(FBRP.PenalCode) do
        if charge.id == id then return charge end
    end
end

function FBRP.FindEmote(id)
    for _, emote in ipairs(FBRP.Emotes) do
        if emote.id == id then return emote end
    end
end

function FBRP.IsFreshwater(x, y)
    for _, box in ipairs(FBRP.Fishing.freshwater) do
        if x >= box.minX and x <= box.maxX and y >= box.minY and y <= box.maxY then return true end
    end
    return false
end
