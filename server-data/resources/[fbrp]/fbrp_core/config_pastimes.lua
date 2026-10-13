-- Florida Bay Pastimes. Shared so the client draws the same routes the server
-- validates. Everything here rewards Bay Rep, records and titles: Florida Bay
-- still has no in-game cash economy.

FBRP.Pastimes = {
    -- Bay Rep ladder. Every pastime feeds the same number.
    levels = {
        { rep=0, label='Newcomer' },
        { rep=250, label='Regular' },
        { rep=700, label='Familiar Face' },
        { rep=1500, label='Local Fixture' },
        { rep=3000, label='Bay Veteran' },
        { rep=5500, label='Florida Icon' },
    },

    daily = { base=40, perStreakDay=10, maxStreakBonus=100, weeklyBonus=100 },

    -- ───────────────────────── side jobs ─────────────────────────
    -- Two legs: reach the pickup, then the drop-off. The server picks both,
    -- checks the vehicle type and position at each leg, and refuses legs that
    -- were finished faster than the vehicle could physically cover them.
    jobs = {
        cooldownSeconds = 15,
        pickupRadius = 14.0,
        chainWindowSeconds = 600,   -- finish another job within this window to extend the shift streak
        chainBonusPercent = 5,      -- per job already in the streak
        chainMaxPercent = 25,
        maxSpeed = { ground=75.0, bike=45.0, air=140.0 },   -- m/s ceiling used to reject impossible legs
        types = {
            rideshare = {
                label = 'Rideshare', icon = 'car', pool = 'street', vehicles = { automobile = true },
                description = 'Collect a passenger from the curb and drive them across town. Smooth driving earns tips.',
                requirement = 'Car with a free passenger seat', passenger = true,
                minLeg = 1200, maxLeg = 7000, baseRep = 18, perKm = 10, parSpeed = 17.0,
                pedModels = { 'a_m_y_business_01', 'a_f_y_business_01', 'a_m_y_hipster_01', 'a_f_y_hipster_01', 'a_m_y_tourist_01', 'a_f_y_tourist_01', 'a_m_m_business_01', 'a_f_y_shopping_01' },
            },
            courier = {
                label = 'Courier run', icon = 'file', pool = 'street', vehicles = { automobile = true, bike = true },
                description = 'Collect a parcel from the pickup and deliver it across the bay before the clock runs out.',
                requirement = 'Car or motorcycle',
                minLeg = 1500, maxLeg = 9000, baseRep = 16, perKm = 9, parSpeed = 19.0,
            },
            messenger = {
                label = 'Bike messenger', icon = 'walk', pool = 'street', vehicles = { bike = true, bicycle = true }, bicycleOnly = true,
                description = 'Pedal sealed envelopes between downtown offices. Short hops, big respect.',
                requirement = 'Bicycle',
                minLeg = 500, maxLeg = 2600, baseRep = 14, perKm = 22, parSpeed = 8.5,
                central = true,
            },
            charter = {
                label = 'Air charter', icon = 'gauge', pool = 'air', vehicles = { heli = true, plane = true },
                description = 'Fly a passenger between airfields and helipads. Land inside the marked zone to finish.',
                requirement = 'Helicopter or plane',
                minLeg = 1800, maxLeg = 12000, baseRep = 45, perKm = 12, parSpeed = 50.0, air = true,
            },
        },
        pools = {
            street = {
                { label='Rockford Plaza', x=-162.18, y=-302.3, z=39.71 },
                { label='Legion Square', x=195.0, y=-935.0, z=30.69 },
                { label='Little Seoul car wash', x=-700.01, y=-933.06, z=19.0 },
                { label='Vespucci Boulevard', x=-818.76, y=-1076.82, z=11.33 },
                { label='Strawberry car wash', x=55.7, y=-1391.3, z=29.4 },
                { label='Davis Grove Street', x=-50.7, y=-1755.71, z=29.42 },
                { label='Mirror Park', x=1212.17, y=-472.87, z=66.21 },
                { label='Vinewood Boulevard', x=322.11, y=180.81, z=103.59 },
                { label='Morningwood', x=-1488.68, y=-381.17, z=40.16 },
                { label='Del Perro Boulevard', x=-1196.41, y=-774.02, z=17.32 },
                { label='Vespucci Canals', x=-1153.31, y=-1425.48, z=4.95 },
                { label='Chumash Plaza', x=-3241.03, y=1004.56, z=12.83 },
                { label='Banham Canyon', x=-3041.25, y=589.09, z=7.91 },
                { label='Tataviam Mountains', x=2558.06, y=385.81, z=108.62 },
                { label='Route 68', x=544.5, y=2669.01, z=42.15 },
                { label='Harmony', x=1166.78, y=2708.1, z=38.15 },
                { label='Sandy Shores', x=1964.67, y=3741.8, z=32.34 },
                { label='Grapeseed', x=1701.72, y=4927.75, z=42.06 },
                { label='Paleto Bay', x=0.61, y=6514.44, z=31.87 },
                { label='Pillbox Hill', x=307.0, y=-595.0, z=43.3 },
                { label='Premium Deluxe showroom', x=-47.16, y=-1115.33, z=26.5 },
                { label='Burton Customs', x=-352.94, y=-135.84, z=39.0 },
                { label='Benny\'s Original Motor Works', x=-211.6, y=-1323.28, z=30.8 },
                { label='La Mesa', x=729.16, y=-1088.22, z=22.17 },
                { label='Life Invader', x=-1047.9, y=-233.0, z=39.0 },
                { label='Vinewood racetrack', x=1151.84, y=119.37, z=81.87 },
            },
            air = {
                { label='Los Santos International', x=-1336.0, y=-3044.0, z=13.94, radius=150.0 },
                { label='Sandy Shores Airfield', x=1747.0, y=3273.7, z=41.1, radius=120.0 },
                { label='McKenzie Field', x=2131.0, y=4785.0, z=41.0, radius=120.0 },
                { label='La Puerta heliport', x=-735.56, y=-1456.48, z=5.0, radius=45.0, heliOnly=true },
                { label='Maze Bank helipad', x=-75.0, y=-818.0, z=326.2, radius=30.0, heliOnly=true },
                { label='Galileo Observatory', x=-438.7, y=1075.0, z=352.4, radius=55.0, heliOnly=true },
            },
        },
    },

    -- ───────────────────────── supply drops ─────────────────────────
    drops = {
        minPlayers = 1,
        firstDelayMinutes = 10,
        minIntervalMinutes = 25,
        maxIntervalMinutes = 45,
        lifetimeMinutes = 14,
        searchRadius = 260.0,      -- the blip circle shown to everyone
        revealRadius = 230.0,      -- come this close and the exact spot is revealed
        claimRadius = 4.5,
        claimMs = 7000,
        rep = 120,
        extraRepPerContender = 10, -- more rivals nearby = a bigger prize (capped)
        extraRepCap = 40,
        -- Placed on top of existing caches and landmarks at runtime, plus these.
        extraLocations = {
            { label='Redwood Lights Track', region='Senora Desert', x=1022.5, y=2408.15, z=55.22 },
            { label='Tongva Vineyard', region='Tongva Valley', x=-1888.0, y=2050.0, z=140.9 },
            { label='Terminal Yard', region='Elysian Island', x=472.9, y=-3036.0, z=6.2 },
            { label='Richman Golf Club', region='Richman', x=-1369.88, y=57.38, z=53.7 },
            { label='East Coast Cave', region='Cape Catfish', x=3109.63, y=2192.22, z=8.59 },
        },
        models = { 'prop_drop_crate_01', 'prop_mil_crate_01', 'prop_box_wood02a_pu', 'prop_box_wood05a' },
    },

    -- ───────────────────────── street duels ─────────────────────────
    duels = {
        challengeRadius = 45.0,
        minRoute = 400.0,
        maxRoute = 6500.0,
        acceptSeconds = 30,
        countdownSeconds = 5,
        finishRadius = 30.0,
        maxSeconds = 300,
        cooldownSeconds = 20,
        startRating = 1000,
        kFactor = 28,
        winRep = 30,
        perKmRep = 6,
        loseRep = 6,
        teleportMeters = 140.0,    -- farther than this in one poll is a forfeit
        onFootGraceSeconds = 10,
    },

    -- ───────────────────────── skydiving ─────────────────────────
    -- The server carries the player to the platform, so there is nothing to
    -- climb to. Score is the landing distance from the target centre.
    skydive = {
        cooldownSeconds = 20,
        minFlightSeconds = 5,
        maxFlightSeconds = 420,
        maxLandingRange = 1800.0,
        bands = {
            { max=5.0, label='Bullseye', rep=90 },
            { max=15.0, label='Pinpoint', rep=60 },
            { max=40.0, label='Close', rep=35 },
            { max=100.0, label='On target', rep=20 },
            { max=400.0, label='In the area', rep=10 },
        },
        offTargetRep = 4,
        jumps = {
            { id='maze_bank', label='Maze Bank Plunge', difficulty='Easy',
              description='Step off the tower roof and glide down onto Legion Square.',
              start=vector3(-75.0, -819.0, 327.5), target=vector3(195.0, -935.0, 30.7) },
            { id='observatory', label='Observatory Leap', difficulty='Medium',
              description='Leap from the Galileo Observatory and aim for the lights of the Tequi-la-la.',
              start=vector3(-438.7, 1075.0, 354.0), target=vector3(-555.16, 284.97, 82.17) },
            { id='chiliad', label='Chiliad Cableway', difficulty='Hard',
              description='From the very top of Mount Chiliad down to the cable car base. A long, careful glide.',
              start=vector3(450.2, 5566.1, 808.0), target=vector3(-740.8, 5599.2, 41.7) },
            { id='highalt', label='High Altitude Drop', difficulty='Expert',
              description='Fall from 1,300 metres above Los Santos International and put it down on the airfield.',
              start=vector3(-1336.0, -3044.0, 1310.0), target=vector3(-1336.0, -3044.0, 13.94) },
        },
    },

    -- ───────────────────────── community goals ─────────────────────────
    -- Three goals rotate in each week. Everyone who contributed shares the reward.
    community = {
        goalsPerWeek = 3,
        reward = 150,
        pool = {
            { id='fish', label='Bay Fish Fry', description='Land fish around Florida Bay', target=120, source='fish', icon='fish' },
            { id='jobs', label='Keep Bay Moving', description='Finish rideshare, courier, messenger or charter jobs', target=60, source='job', icon='car' },
            { id='stamps', label='Postcards Home', description='Collect Coastal Passport stamps', target=25, source='stamp', icon='pin' },
            { id='caches', label='Treasure Season', description='Find daily geocaches', target=15, source='cache', icon='search' },
            { id='duels', label='Street Season', description='Run street duels', target=20, source='duel', icon='gauge' },
            { id='jumps', label='Sky Is Full', description='Complete skydiving jumps', target=30, source='skydive', icon='sparkles' },
            { id='drops', label='Crate Hunters', description='Secure supply drops', target=4, source='drop', icon='target' },
        },
    },

    -- ───────────────────────── achievements ─────────────────────────
    -- `stat` names a counter built in server/pastimes.lua. `title` is a
    -- cosmetic string players can wear in leaderboards and announcements.
    achievements = {
        { id='fish_1', label='First Bite', desc='Land your first fish', stat='fish', target=1, rep=10, tier='common' },
        { id='fish_25', label='Weekend Angler', desc='Land 25 fish', stat='fish', target=25, rep=40, tier='common', title='Angler' },
        { id='fish_100', label='Reel Deal', desc='Land 100 fish', stat='fish', target=100, rep=100, tier='rare', title='Master Angler' },
        { id='species_10', label='Naturalist', desc='Catch 10 different species', stat='species', target=10, rep=70, tier='rare', title='Naturalist' },
        { id='epic_1', label='Big Game', desc='Land an epic or legendary catch', stat='fish_epic', target=1, rep=80, tier='epic' },
        { id='legend_1', label='Leviathan Hunter', desc='Land a legendary fish', stat='fish_legend', target=1, rep=150, tier='legendary', title='Leviathan Hunter' },

        { id='stamp_1', label='Tourist', desc='Collect a Coastal Passport stamp', stat='stamps', target=1, rep=10, tier='common' },
        { id='stamp_5', label='Postcard Collector', desc='Collect 5 passport stamps', stat='stamps', target=5, rep=50, tier='common' },
        { id='stamp_10', label='Globetrotter', desc='Collect every passport stamp', stat='stamps', target=10, rep=120, tier='epic', title='Globetrotter' },

        { id='run_5', label='Lap Time', desc='Finish 5 challenge runs', stat='runs', target=5, rep=40, tier='common' },
        { id='run_25', label='Circuit Regular', desc='Finish 25 challenge runs', stat='runs', target=25, rep=100, tier='rare', title='Circuit Regular' },
        { id='cache_1', label='Cache Me If You Can', desc='Find a geocache', stat='caches', target=1, rep=15, tier='common' },
        { id='cache_10', label='Treasure Hunter', desc='Find 10 geocaches', stat='caches', target=10, rep=110, tier='rare', title='Treasure Hunter' },

        { id='job_1', label='First Fare', desc='Finish a side job', stat='jobs', target=1, rep=10, tier='common' },
        { id='job_25', label='Regular Hustle', desc='Finish 25 side jobs', stat='jobs', target=25, rep=60, tier='common' },
        { id='job_100', label='Full-Time', desc='Finish 100 side jobs', stat='jobs', target=100, rep=180, tier='epic', title='Workhorse' },
        { id='ride_20', label='Five Stars', desc='Finish 20 rideshare fares', stat='job_rideshare', target=20, rep=80, tier='rare', title='Chauffeur' },
        { id='courier_20', label='Special Delivery', desc='Finish 20 courier runs', stat='job_courier', target=20, rep=80, tier='rare', title='Courier' },
        { id='messenger_20', label='Pedal Pusher', desc='Finish 20 bike messenger jobs', stat='job_messenger', target=20, rep=90, tier='rare', title='Messenger' },
        { id='charter_10', label='Frequent Flyer', desc='Finish 10 air charters', stat='job_charter', target=10, rep=120, tier='epic', title='Captain' },

        { id='drop_1', label='Finders Keepers', desc='Secure a supply drop', stat='drops', target=1, rep=30, tier='common' },
        { id='drop_5', label='Crate Hunter', desc='Secure 5 supply drops', stat='drops', target=5, rep=100, tier='rare', title='Scavenger' },
        { id='drop_15', label='Supply Chain', desc='Secure 15 supply drops', stat='drops', target=15, rep=250, tier='legendary', title='Supply Chain' },

        { id='duel_1', label='Green Light', desc='Win a street duel', stat='duels_won', target=1, rep=25, tier='common' },
        { id='duel_10', label='Street Contender', desc='Win 10 street duels', stat='duels_won', target=10, rep=100, tier='rare', title='Contender' },
        { id='duel_25', label='Street Legend', desc='Win 25 street duels', stat='duels_won', target=25, rep=220, tier='legendary', title='Street Legend' },
        { id='duel_streak', label='Hot Streak', desc='Win 5 duels in a row', stat='best_duel_streak', target=5, rep=130, tier='epic', title='Hot Streak' },
        { id='duel_rating', label='Ace Driver', desc='Reach a 1200 duel rating', stat='duel_rating', target=1200, rep=140, tier='epic', title='Ace Driver' },

        { id='dive_1', label='First Jump', desc='Complete a skydive', stat='skydives', target=1, rep=20, tier='common' },
        { id='dive_10', label='Skydiver', desc='Complete 10 skydives', stat='skydives', target=10, rep=90, tier='rare', title='Skydiver' },
        { id='bull_1', label='Bullseye', desc='Land inside the bullseye ring', stat='bullseyes', target=1, rep=80, tier='rare' },
        { id='bull_10', label='Pinpoint', desc='Land 10 bullseyes', stat='bullseyes', target=10, rep=200, tier='legendary', title='Pinpoint' },

        { id='daily_7', label='One Week In', desc='Keep a 7 day check-in streak', stat='best_daily_streak', target=7, rep=70, tier='rare' },
        { id='daily_30', label='Part of the Furniture', desc='Keep a 30 day check-in streak', stat='best_daily_streak', target=30, rep=250, tier='legendary', title='Part of the Furniture' },
    },
}

function FBRP.FindPastimeJob(id)
    return FBRP.Pastimes.jobs.types[id]
end

function FBRP.FindSkydive(id)
    for _, jump in ipairs(FBRP.Pastimes.skydive.jumps) do
        if jump.id == id then return jump end
    end
end
