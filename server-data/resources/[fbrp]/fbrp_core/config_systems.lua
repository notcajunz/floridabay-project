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
    -- Work and good behaviour can never cut more than this share of a sentence.
    maxReductionPercent = 60,
    -- Good behaviour: 0-100. Calm minutes and finished jobs raise it, leash
    -- breaks and failed breakouts drop it. The tier scales every job reduction,
    -- and at "Good" or better a good-time credit quietly shortens the sentence.
    behaviour = {
        start = 60,
        calmMinuteGain = 2,
        jobGain = 4,
        leashPenalty = 12,
        escapePenalty = 30,
        goodTimeThreshold = 75,
        goodTimeSecondsPerMinute = 6,
        tiers = {
            { min=90, label='Exemplary', mult=1.5 },
            { min=75, label='Good', mult=1.25 },
            { min=45, label='Fair', mult=1.0 },
            { min=0, label='Poor', mult=0.5 },
        },
    },
    -- Prison jobs (/prisonwork). Each job walks the inmate through `steps`
    -- spots; every finished step takes `reduction` seconds off (scaled by the
    -- behaviour tier). Markers snap to the ground client side.
    jobs = {
        { id='electrical', label='Electrical repair', icon='power', description='Fix the yard wiring and junction boxes.',
          steps=1, holdMs=9000, reduction=45, scenario='WORLD_HUMAN_WELDING', prompt='repair the electrical box',
          spots={ vector3(1761.46, 2540.41, 45.56), vector3(1718.54, 2527.80, 45.56), vector3(1700.20, 2474.81, 45.56), vector3(1664.83, 2501.58, 45.56), vector3(1621.62, 2509.30, 45.56), vector3(1627.94, 2538.39, 45.56) } },
        { id='cleaning', label='Yard cleaning', icon='sparkles', description='Sweep and mop three areas of the yard.',
          steps=3, holdMs=7000, reduction=20, scenario='WORLD_HUMAN_JANITOR', prompt='sweep this area',
          spots={ vector3(1663.5, 2528.0, 45.56), vector3(1655.0, 2551.0, 45.56), vector3(1690.0, 2530.0, 45.56), vector3(1678.0, 2512.0, 45.56), vector3(1702.0, 2518.0, 45.56), vector3(1646.0, 2536.0, 45.56) } },
        { id='farming', label='Prison farm', icon='leaf', description='Till the beds, plant seedlings and bring in the harvest.',
          steps=3, holdMs=8000, reduction=25, scenario='WORLD_HUMAN_GARDENER_PLANT', prompt='work the vegetable bed',
          stepLabels={ 'Till the soil', 'Plant seedlings', 'Harvest the crop' },
          spots={ vector3(1695.0, 2480.0, 45.56), vector3(1688.0, 2485.0, 45.56), vector3(1680.0, 2490.0, 45.56), vector3(1672.0, 2496.0, 45.56) } },
        { id='kitchen', label='Kitchen duty', icon='flame', description='Prep and cook a meal service at the mess hall grills.',
          steps=2, holdMs=8000, reduction=30, scenario='PROP_HUMAN_BBQ', prompt='cook at the grill',
          spots={ vector3(1640.0, 2530.0, 45.56), vector3(1645.0, 2522.0, 45.56), vector3(1636.0, 2524.0, 45.56) } },
        { id='laundry', label='Laundry', icon='shirt', description='Sort, wash and fold the prison laundry.',
          steps=2, holdMs=7000, reduction=20, scenario='PROP_HUMAN_BUM_BIN', prompt='sort the laundry',
          spots={ vector3(1712.0, 2535.0, 45.56), vector3(1725.0, 2540.0, 45.56), vector3(1718.0, 2545.0, 45.56) } },
        { id='workout', label='Yard workout', icon='heart-pulse', description='Stay out of trouble. No time off, but a big behaviour boost.',
          steps=2, holdMs=10000, reduction=0, behaviour=6, scenario='WORLD_HUMAN_PUSH_UPS', prompt='work out',
          spots={ vector3(1643.0, 2545.0, 45.56), vector3(1647.0, 2549.0, 45.56), vector3(1651.0, 2546.0, 45.56) } },
    },
}

-- Community service: an alternative to prison for lesser charges. The
-- offender cleans up rubbish at Legion Square for up to `maxMinutes`. The
-- clock only runs while they are working; walking out of the area for longer
-- than `graceSeconds` sends them straight to Bolingbroke.
FBRP.CommunityService = {
    maxMinutes = 15,
    center = vector3(193.0, -935.0, 30.69),
    spawn = vector4(195.17, -933.6, 30.69, 145.0),
    radius = 60.0,
    graceSeconds = 10,
    idleSeconds = 45,        -- the clock pauses if no rubbish was picked up for this long
    pickupMs = 3500,
    rubbishVisible = 6,
    rubbishSpread = 38.0,
    rubbishModels = { 'prop_rub_litter_01', 'prop_rub_litter_02', 'prop_rub_binbag_01', 'prop_cs_rub_binbag_01', 'ng_proc_sodacan_01a', 'prop_rub_litter_03b' },
    escapeMonths = 15,       -- prison months for walking out, plus one per unserved minute
}

-- Organization economy. Gangs on duty cook or harvest product at a lab and
-- deliver it to a drop-off; the payout goes to the organization wallet
-- (website + Discord only, never in-game cash). Owned properties add private
-- labs and legitimate businesses.
FBRP.Economy = {
    baseCapacity = 24,
    produceMs = { weed=12000, meth=16000, coke=18000 },
    produceCooldownSeconds = 8,
    ownedLabBonus = 50,                  -- % extra yield in a private (owned) lab
    drugs = {
        weed = { label='Weed', yield=4, price=55, color='#4fe08c' },
        meth = { label='Meth', yield=3, price=120, color='#7cf3e6' },
        coke = { label='Cocaine', yield=2, price=160, color='#eef3f5' },
    },
    -- Public labs anyone in a gang can use (owned labs come from the shop).
    labs = {
        { id='grapeseed_field', label='Grapeseed grow field', drug='weed', x=2224.9, y=5577.1, z=53.8, radius=28.0 },
        { id='stab_city', label='Stab City cook trailer', drug='meth', x=66.0, y=3703.7, z=39.75, radius=18.0 },
        { id='cypress_lockup', label='Cypress Flats lockup', drug='coke', x=845.0, y=-2118.0, z=30.5, radius=18.0 },
        { id='paleto_barn', label='Paleto barn grow', drug='weed', x=417.0, y=6520.4, z=27.7, radius=24.0 },
        { id='tongva_vineyard', label='Tongva vineyard rows', drug='weed', x=-1888.0, y=2050.0, z=140.9, radius=24.0 },
        { id='senora_oilfield', label='Senora oilfield shack', drug='meth', x=848.0, y=3004.0, z=44.0, radius=18.0 },
        { id='east_coast_cave', label='East coast sea cave', drug='meth', x=3109.6, y=2192.2, z=8.6, radius=16.0 },
        { id='terminal_yard', label='Terminal container yard', drug='coke', x=472.9, y=-3036.0, z=6.2, radius=18.0 },
        { id='mckenzie_hangar', label='McKenzie Field hangar', drug='coke', x=2131.0, y=4785.0, z=41.0, radius=18.0 },
    },
    dropoffs = {
        { label='Vespucci Canals boathouse', x=-1009.0, y=-1029.0, z=2.15 },
        { label='La Mesa rail yard', x=488.0, y=-639.0, z=24.9 },
        { label='Chamberlain Hills alley', x=-109.0, y=-1566.0, z=34.3 },
        { label='Rancho projects', x=375.0, y=-1993.0, z=24.2 },
        { label='Mirror Park garages', x=1158.0, y=-470.0, z=66.7 },
        { label='Harmony motel', x=1129.0, y=2648.0, z=38.0 },
        { label='Sandy Shores scrapyard', x=2341.0, y=3132.0, z=48.2 },
        { label='Paleto Bay docks', x=-252.0, y=6550.0, z=2.9 },
        { label='Great Chaparral ranch', x=-1144.0, y=2671.0, z=18.1 },
        { label='Del Perro beach lot', x=-1660.0, y=-1015.0, z=13.0 },
        { label='Strawberry car wash', x=55.7, y=-1391.3, z=29.4 },
        { label='Little Seoul car wash', x=-700.0, y=-933.1, z=19.0 },
        { label='Vespucci Beach tattoo alley', x=-1153.3, y=-1425.5, z=4.95 },
        { label='La Puerta heliport', x=-735.6, y=-1456.5, z=5.0 },
        { label='Davis Grove Street 24/7', x=-50.7, y=-1755.7, z=29.4 },
        { label='Morningwood liquor store', x=-1488.7, y=-381.2, z=40.2 },
        { label='Vinewood Boulevard tattoo', x=322.1, y=180.8, z=103.6 },
        { label='Vinewood racetrack lot', x=1151.8, y=119.4, z=81.9 },
        { label='Tataviam truck stop', x=2558.1, y=385.8, z=108.6 },
        { label='Banham Canyon 24/7', x=-3041.3, y=589.1, z=7.9 },
        { label='Chumash plaza', x=-3241.0, y=1004.6, z=12.8 },
        { label='Route 68 store', x=544.5, y=2669.0, z=42.2 },
        { label='Redwood Lights track', x=1022.5, y=2408.2, z=55.2 },
        { label='Senora Freeway 24/7', x=2681.0, y=3283.0, z=55.2 },
        { label='Sandy Shores Alhambra Drive', x=1933.2, y=3728.0, z=32.8 },
        { label='Grapeseed main street', x=1701.7, y=4927.8, z=42.1 },
        { label='Paleto Boulevard strip mall', x=0.6, y=6514.4, z=31.9 },
    },
    dropoffMinDistance = 900.0,
    deliveryMinutes = 18,                -- run expires after this long
    minSecondsPerKm = 22,                -- anti-teleport: fastest believable delivery
    dropoffRadius = 9.0,
    handoffMs = 5000,
    policeTipChance = 35,                -- % chance a drop-off is phoned in to police
    -- Businesses: legit income from owned properties.
    business = {
        taskMs = 10000,
        taskCooldownSeconds = 40,
        hourlyCap = 3500,                -- per organization, before perks
        serviceCooldownSeconds = 45,
        types = {
            mechanic = { label='Mechanic', task='Service a customer car', scenario='PROP_HUMAN_BUM_BIN', pay=120, service='repair', serviceFee=250 },
            bar = { label='Bar', task='Tend the bar', scenario='WORLD_HUMAN_STAND_IMPATIENT', pay=90, service='serve', serviceFee=120 },
            club = { label='Nightclub', task='Work the floor', scenario='WORLD_HUMAN_PARTYING', pay=130, service='serve', serviceFee=160 },
            restaurant = { label='Restaurant', task='Cook an order', scenario='PROP_HUMAN_BBQ', pay=100, service='serve', serviceFee=140 },
            warehouse = { label='Warehouse', task='Pack a shipment', scenario='WORLD_HUMAN_CLIPBOARD', pay=110 },
            lab = { label='Private lab', task='Maintain the equipment', scenario='WORLD_HUMAN_WELDING', pay=60 },
            hideout = { label='Hideout', task='Guard the stash', scenario='WORLD_HUMAN_GUARD_STAND', pay=70 },
        },
    },
    armoryCooldownSeconds = 600,
    -- Purchased organization vehicles spawn in the organization's color with its plate prefix.
    orgPlates = true,
    -- Departments (leo / fire / government) are funded by duty time and seizures
    -- instead of product or businesses. Money goes to the department wallet.
    departments = {
        stipendPerHour = { leo=450, fire=450, government=300 },  -- per member on duty, before perks
        stipendFlushMinutes = 10,                                -- batch duty pay into one ledger line
        seizureBounty = 40,                                      -- % of street value paid to the seizing department
        armoryRadius = 35.0,
        -- Department armories (no property needed). Types decide who may use each one.
        stations = {
            { label='Mission Row PD', types={ leo=true }, x=452.6, y=-980.0, z=30.7 },
            { label='Vespucci PD', types={ leo=true }, x=-1098.6, y=-831.6, z=19.0 },
            { label='Davis Sheriff', types={ leo=true }, x=362.4, y=-1592.4, z=29.3 },
            { label='Sandy Shores Sheriff', types={ leo=true }, x=1853.5, y=3689.6, z=34.3 },
            { label='Paleto Bay Sheriff', types={ leo=true }, x=-448.6, y=6012.9, z=31.7 },
            { label='Davis Fire Station', types={ fire=true }, x=207.0, y=-1645.0, z=29.8 },
            { label='Paleto Fire Station', types={ fire=true }, x=-379.5, y=6118.3, z=31.8 },
            { label='Sandy Shores Fire Station', types={ fire=true }, x=1692.0, y=3586.0, z=35.6 },
            { label='Pillbox Medical', types={ fire=true }, x=307.0, y=-595.0, z=43.3 },
            { label='City Hall', types={ government=true }, x=-544.9, y=-204.0, z=38.2 },
        },
    },
}

-- CAD/MDT options.
FBRP.MDT = {
    unitStatuses = {
        { id='available', label='10-8 Available', short='10-8', tone='ok' },
        { id='enroute', label='En route', short='ENRT', tone='warn' },
        { id='onscene', label='On scene', short='10-23', tone='warn' },
        { id='busy', label='10-6 Busy', short='10-6', tone='bad' },
        { id='transport', label='Transporting', short='10-15', tone='warn' },
        { id='break', label='10-7 Out of service', short='10-7', tone='dim' },
    },
    flags = {
        { id='armed', label='Armed & dangerous', tone='bad' },
        { id='violent', label='Violent history', tone='bad' },
        { id='gang', label='Known gang affiliate', tone='warn' },
        { id='flight', label='Flight risk', tone='warn' },
        { id='mental', label='Mental health', tone='info' },
        { id='caution', label='Officer caution', tone='warn' },
    },
    -- Citizens receive every license and permit immediately. Police can still
    -- suspend or revoke one from the MDT when roleplay calls for it.
    licenses = {
        { id='driver', label='Driver license', selfIssue=true },
        { id='firearm', label='Firearm permit', selfIssue=true },
        { id='cdl', label='Commercial driver', selfIssue=true },
        { id='pilot', label='Pilot license', selfIssue=true },
        { id='boat', label='Boat license', selfIssue=true },
        { id='hunting', label='Hunting license', selfIssue=true },
    },
    reportKinds = { 'Incident', 'Arrest', 'Traffic stop', 'Use of force', 'Investigation', 'Narcotics', 'Pursuit' },
    -- Call priority: 1 is most urgent. Used as the default per dispatch kind.
    callPriority = { PANIC=1, BACKUP=1, ['911']=2, EMS=2, PRISON=1, DRUGS=2, BOLO=3, TRAFFIC=3, ['311']=3 },
    boloExpireHours = 72,   -- BOLOs close themselves after this long
    addendumMax = 40,       -- addenda kept per report
}

-- Civilian identity: what a citizen can change about themselves, and the
-- choices offered by the My Citizen menu.
FBRP.Citizen = {
    identityCooldownDays = 7,   -- name, birth date and gender may be changed this often
    minAge = 18,
    idThemes = {
        { id='classic', label='Bay Classic' },
        { id='sunset', label='Sunset' },
        { id='midnight', label='Midnight' },
        { id='gold', label='Gold Coast' },
        { id='evergreen', label='Evergreen' },
    },
    eyeColors = { 'Brown', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber', 'Black' },
    hairColors = { 'Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Bald', 'Other' },
    bloodTypes = { 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-' },
    restrictions = { 'Corrective lenses', 'Daylight only', 'Automatic only', 'Hearing aid', 'Supervised use' },
    maxHeightCm = 230,
    maxWeightKg = 250,
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
    { id='possession', title='Possession of a controlled substance', kind='misdemeanor', months=8, fine=750 },
    { id='intent', title='Possession with intent to distribute', kind='felony', months=20, fine=0 },
    { id='service_fail', title='Failure to complete community service', kind='misdemeanor', months=10, fine=0 },
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

-- Repeatable open-world activities. Routes are server validated one checkpoint
-- at a time and store personal/server records. One geocache rotates daily so
-- there is always a small reason to explore somewhere different.
FBRP.Activities = {
    checkpointRadius = 18.0,
    cacheRadius = 8.0,
    challenges = {
        {
            id='vespucci_sprint', label='Vespucci Sprint', mode='car', icon='car',
            description='A quick street circuit through Vespucci and the canals.', minSeconds=38,
            checkpoints={
                vector3(-1178.8,-1507.2,4.4), vector3(-1028.4,-1598.1,4.9),
                vector3(-875.5,-1420.2,6.1), vector3(-1021.2,-1191.8,5.7),
                vector3(-1286.1,-1217.4,4.8), vector3(-1407.7,-1399.8,4.1),
                vector3(-1178.8,-1507.2,4.4),
            },
        },
        {
            id='senora_scramble', label='Senora Scramble', mode='offroad', icon='gauge',
            description='Dust, switchbacks, and rough ground across the Grand Senora.', minSeconds=55,
            checkpoints={
                vector3(1714.0,3254.5,41.1), vector3(2024.2,3307.6,45.7),
                vector3(2357.7,3079.8,48.2), vector3(2498.7,2823.3,38.7),
                vector3(2226.4,2703.1,46.1), vector3(1940.5,2870.2,46.1),
                vector3(1714.0,3254.5,41.1),
            },
        },
        {
            id='chiliad_trail', label='Chiliad Trail Run', mode='foot', icon='walk',
            description='A technical trail run from the cable station to the summit.', minSeconds=95,
            checkpoints={
                vector3(449.2,5571.8,781.2), vector3(421.8,5612.0,766.5),
                vector3(356.6,5619.1,780.2), vector3(318.4,5597.7,796.7),
                vector3(382.1,5537.6,747.1), vector3(450.2,5566.1,806.2),
            },
        },
        {
            id='beach_bike', label='Beach Bike Circuit', mode='bicycle', icon='heart-pulse',
            description='A pedal-only circuit from Vespucci to Del Perro and back.', minSeconds=70,
            checkpoints={
                vector3(-1224.4,-1511.7,4.3), vector3(-1381.8,-1392.0,4.2),
                vector3(-1618.7,-1074.2,13.0), vector3(-1819.0,-858.8,8.8),
                vector3(-1912.0,-737.4,5.3), vector3(-1811.8,-1183.1,13.0),
                vector3(-1503.0,-1270.8,2.3), vector3(-1224.4,-1511.7,4.3),
            },
        },
    },
    caches = {
        { id='lifeguard', label='Vespucci Lifeguard Cache', region='Vespucci Beach', clue='Where lifeguards watch the southern sand.', x=-1203.7,y=-1560.2,z=4.6 },
        { id='observatory', label='Observatory Cache', region='Vinewood Hills', clue='Behind the domes, beneath the city lights.', x=-416.4,y=1173.2,z=325.8 },
        { id='sandy_tower', label='Sandy Water Tower Cache', region='Sandy Shores', clue='At the foot of the tower that watches the desert.', x=1681.1,y=3562.7,z=35.6 },
        { id='paleto_dock', label='Paleto Dock Cache', region='Paleto Bay', clue='Where timber meets the cold northern water.', x=-280.5,y=6634.3,z=7.5 },
        { id='lighthouse', label='Lighthouse Cache', region='Cape Catfish', clue='Below the beacon at the far eastern shore.', x=3319.0,y=5173.5,z=18.4 },
        { id='quarry', label='Quarry Cache', region='Davis Quartz', clue='A quiet overlook above the industrial canyon.', x=2947.6,y=2788.8,z=40.6 },
        { id='zancudo', label='River Cache', region='Zancudo River', clue='Under the old bridge where fresh water meets the sea.', x=-1524.2,y=1509.1,z=111.7 },
        { id='mirror_park', label='Mirror Park Cache', region='Mirror Park', clue='Near the water, away from the city traffic.', x=1078.1,y=-689.7,z=57.7 },
        { id='grapeseed', label='Grapeseed Cache', region='Grapeseed', clue='Beside the weathered barn at the edge of the fields.', x=2448.4,y=4978.8,z=46.8 },
        { id='airport', label='Airport Lookout Cache', region='LSIA', clue='Watch the departures from outside the fence.', x=-984.6,y=-2637.7,z=13.9 },
    },
}

function FBRP.FindActivity(id)
    for _, activity in ipairs(FBRP.Activities.challenges) do
        if activity.id == id then return activity end
    end
end

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

-- Launch essentials: AFK slot recovery, playtime, first-join welcome,
-- connection and combat-log audits, staff chat and help commands.
FBRP.Essentials = {
    website = 'https://floridabay.net',
    discordFallback = 'discord.gg/floridabayrp',
    -- AFK: a player who neither moves, looks around nor talks for this long
    -- is warned, then disconnected to free the slot. When the server is at
    -- least `busyFraction` full the shorter limit applies. Staff on duty and
    -- the `fbrp.afk.bypass` ACE are exempt.
    afk = {
        enabled = true,
        minutes = 30,
        busyMinutes = 15,
        busyFraction = 0.8,
        warnMinutes = 2,
        bypassAce = 'fbrp.afk.bypass',
    },
    playtimeFlushSeconds = 300,
    -- A drop this soon after taking player damage, or while restrained or
    -- downed, is flagged to on-duty staff and the game audit log.
    combatLogSeconds = 45,
    rules = {
        'Respect every player. No harassment, hate speech or targeting real-life traits.',
        'No random deathmatch (RDM) or vehicle deathmatch (VDM). Violence needs roleplay first.',
        'Value your life: fear-RP when outnumbered or at gunpoint.',
        'No metagaming: Discord, streams and OOC chat are never in-character knowledge.',
        'No powergaming or forcing outcomes on others. Give people room to respond.',
        'New life rule: after you are downed and respawn, forget the scene that killed you.',
        'Do not log out to escape a scene, arrest or injury (combat logging).',
        'Use /report for rule breaks and let staff handle it. Full rules are on the Discord.',
    },
    help = {
        { '/me /do /ooc', 'Character actions, scene details and nearby out-of-character chat' },
        { 'M', 'Interaction hub: tags, duty, vehicles, emotes and more' },
        { '/911 /311', 'Call emergency or non-emergency services' },
        { '/duty /clockin', 'Clock into your organization or staff duty' },
        { '/report', 'Report a player or problem to staff' },
        { '/pastimes /activities', 'Side jobs, fishing, duels, skydiving and more' },
        { '/playtime /id', 'Your time in Florida Bay and your server ID' },
        { '/rules /discord', 'Community rules and the Discord invite' },
    },
}
