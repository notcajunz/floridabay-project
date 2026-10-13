-- Florida Bay Pastimes core: Bay Rep, titles, achievements, the daily
-- check-in and weekly community goals. The side jobs, supply drops, street
-- duels and skydiving modules plug into FBRP.PastimeServer.

local S = FBRP.Server
local P = FBRP.Pastimes
local sessions, now, notify, chat = S.sessions, S.now, S.notify, S.chat

local PS = { sections = {} }
FBRP.PastimeServer = PS

local DAY = 86400
local TIER_COLOR = { common = { 147, 163, 171 }, rare = { 111, 168, 255 }, epic = { 196, 139, 255 }, legendary = { 255, 181, 71 } }
local COUNTERS = { jobs_done = true, drops_won = true, skydives = true, bullseyes = true }

function PS.dayKey(offsetDays)
    return os.date('!%Y-%m-%d', os.time() + (offsetDays or 0) * DAY)
end

-- Weeks run Monday to Sunday (UTC). The epoch fell on a Thursday.
function PS.week()
    local day = math.floor(os.time() / DAY)
    local startDay = day - ((day + 3) % 7)
    return {
        key = os.date('!%Y-%m-%d', startDay * DAY),
        startMs = startDay * DAY * 1000,
        endMs = (startDay + 7) * DAY * 1000,
        index = startDay // 7,
    }
end

local function scalar(sql, args)
    return tonumber(MySQL.scalar.await(sql, args or {})) or 0
end

-- ───────────────────────── profile & rep ─────────────────────────

local ensured = {}

function PS.ensure(src)
    local s = sessions[src]
    if not s then return nil end
    if not ensured[src] then
        MySQL.prepare.await([[
            INSERT INTO pastime_profiles(license,name,duel_rating,updated_at) VALUES(?,?,?,?)
            ON DUPLICATE KEY UPDATE name=VALUES(name)
        ]], { s.license, S.displayName(src), P.duels.startRating, now() })
        ensured[src] = true
    end
    return s.license
end

local function levelFor(rep)
    local index = 1
    for i, level in ipairs(P.levels) do
        if rep >= level.rep then index = i end
    end
    return index
end

function PS.level(rep)
    local index = levelFor(rep)
    return P.levels[index], P.levels[index + 1]
end

function PS.award(src, amount, reason)
    local s = sessions[src]
    amount = math.floor(tonumber(amount) or 0)
    if not s or amount <= 0 then return nil end
    PS.ensure(src)
    local before = scalar('SELECT rep FROM pastime_profiles WHERE license=?', { s.license })
    MySQL.update.await('UPDATE pastime_profiles SET rep=rep+?,updated_at=? WHERE license=?', { amount, now(), s.license })
    local after = before + amount
    if levelFor(after) > levelFor(before) then
        local level = P.levels[levelFor(after)]
        notify(src, ('Bay Rep level up: %s'):format(level.label), 'success')
        chat(src, 'BAY REP', ('You are now a %s (%d rep).'):format(level.label, after), { 255, 181, 71 })
        if levelFor(after) >= 5 then
            S.broadcast('BAY REP', ('%s has become a %s!'):format(S.displayName(src), level.label), { 255, 181, 71 })
        end
    end
    return after
end

function PS.bump(src, column, amount)
    local s = sessions[src]
    if not s or not COUNTERS[column] then return end
    PS.ensure(src)
    MySQL.update.await(('UPDATE pastime_profiles SET %s=%s+?,updated_at=? WHERE license=?'):format(column, column), {
        math.floor(tonumber(amount) or 1), now(), s.license
    })
end

function PS.log(license, kind, ref, amount)
    MySQL.insert('INSERT INTO pastime_log(license,kind,ref,amount,created_at) VALUES(?,?,?,?,?)', {
        license, kind, ref and tostring(ref):sub(1, 40) or nil, math.floor(tonumber(amount) or 1), now()
    })
end

function PS.blocked(src)
    local player = Player(src)
    if not player then return 'Not available right now.' end
    if player.state['fbrp:jailed'] or player.state['fbrp:communityService'] then return 'You cannot do that while in custody.' end
    if player.state['fbrp:downed'] then return 'You cannot do that while incapacitated.' end
    if player.state['fbrp:restrained'] then return 'You cannot do that while restrained.' end
    return nil
end

function PS.titleOf(src)
    local s = sessions[src]
    if not s then return nil end
    return MySQL.scalar.await('SELECT title FROM pastime_profiles WHERE license=?', { s.license })
end

-- ───────────────────────── achievements ─────────────────────────

local function statsFor(license)
    local st = {}
    local ok = pcall(function()
        local p = MySQL.single.await('SELECT * FROM pastime_profiles WHERE license=?', { license }) or {}
        st.jobs = tonumber(p.jobs_done) or 0
        st.drops = tonumber(p.drops_won) or 0
        st.duels_won = tonumber(p.duels_won) or 0
        st.best_duel_streak = tonumber(p.best_duel_streak) or 0
        st.duel_rating = tonumber(p.duel_rating) or 0
        st.skydives = tonumber(p.skydives) or 0
        st.bullseyes = tonumber(p.bullseyes) or 0
        st.best_daily_streak = tonumber(p.best_daily_streak) or 0
        st.fish = scalar("SELECT COUNT(*) FROM fishing_catches WHERE license=? AND rarity<>'junk'", { license })
        st.species = scalar("SELECT COUNT(DISTINCT species) FROM fishing_catches WHERE license=? AND rarity<>'junk'", { license })
        st.fish_epic = scalar("SELECT COUNT(*) FROM fishing_catches WHERE license=? AND rarity IN ('epic','legendary')", { license })
        st.fish_legend = scalar("SELECT COUNT(*) FROM fishing_catches WHERE license=? AND rarity='legendary'", { license })
        st.stamps = scalar('SELECT COUNT(*) FROM passport_discoveries WHERE license=?', { license })
        local activity = MySQL.single.await('SELECT completions,caches_found FROM activity_profiles WHERE license=?', { license }) or {}
        st.runs = tonumber(activity.completions) or 0
        st.caches = tonumber(activity.caches_found) or 0
        for _, row in ipairs(MySQL.query.await('SELECT job_id,completions FROM pastime_job_stats WHERE license=?', { license })) do
            st['job_' .. row.job_id] = tonumber(row.completions) or 0
        end
    end)
    return st, ok
end

local lastCheck = {}

function PS.checkAchievements(src, force)
    local s = sessions[src]
    if not s then return 0 end
    local t = now()
    if not force and lastCheck[src] and t - lastCheck[src] < 4000 then return 0 end
    lastCheck[src] = t
    PS.ensure(src)
    local st, ok = statsFor(s.license)
    if not ok then return 0 end
    local have = {}
    for _, row in ipairs(MySQL.query.await('SELECT achievement_id FROM pastime_achievements WHERE license=?', { s.license })) do
        have[row.achievement_id] = true
    end
    local gained, count = 0, 0
    for _, def in ipairs(P.achievements) do
        if not have[def.id] and (st[def.stat] or 0) >= def.target then
            local inserted = MySQL.update.await('INSERT IGNORE INTO pastime_achievements(license,achievement_id,unlocked_at) VALUES(?,?,?)', { s.license, def.id, now() })
            if tonumber(inserted) == 1 then
                count = count + 1
                gained = gained + def.rep
                notify(src, ('Achievement unlocked: %s (+%d rep)'):format(def.label, def.rep), 'success')
                local color = TIER_COLOR[def.tier] or TIER_COLOR.common
                chat(src, 'ACHIEVEMENT', ('%s · %s%s'):format(def.label, def.desc, def.title and (' · title "' .. def.title .. '"') or ''), color)
                if def.tier == 'epic' or def.tier == 'legendary' then
                    S.broadcast('ACHIEVEMENT', ('%s unlocked %s!'):format(S.displayName(src), def.label), color)
                end
                FBRP.DB.audit(s.discord or s.license, 'pastime.achievement', def.id, { rep = def.rep })
            end
        end
    end
    if gained > 0 then PS.award(src, gained, 'achievement') end
    return count
end

-- ───────────────────────── daily check-in ─────────────────────────

RegisterNetEvent('fbrp:pastimes:daily', function()
    local src = source
    local s = sessions[src]
    if not s then return end
    PS.ensure(src)
    local row = MySQL.single.await('SELECT daily_streak,last_daily_day FROM pastime_profiles WHERE license=?', { s.license }) or {}
    local today = PS.dayKey()
    if row.last_daily_day == today then return notify(src, 'You already checked in today. Come back tomorrow.', 'info') end
    local streak = row.last_daily_day == PS.dayKey(-1) and (tonumber(row.daily_streak) or 0) + 1 or 1
    local D = P.daily
    local rep = D.base + math.min(D.maxStreakBonus, (streak - 1) * D.perStreakDay)
    if streak % 7 == 0 then rep = rep + D.weeklyBonus end
    MySQL.update.await([[
        UPDATE pastime_profiles SET daily_streak=?,best_daily_streak=GREATEST(best_daily_streak,?),last_daily_day=?,updated_at=?
        WHERE license=?
    ]], { streak, streak, today, now(), s.license })
    PS.log(s.license, 'daily', today, 1)
    PS.award(src, rep, 'daily')
    notify(src, ('Daily check-in: day %d · +%d Bay Rep'):format(streak, rep), 'success')
    PS.checkAchievements(src, true)
    PS.open(src)
end)

-- ───────────────────────── community goals ─────────────────────────

local function activeGoals()
    local week = PS.week()
    local pool = P.community.pool
    local picks, n = {}, #pool
    local start = (week.index * P.community.goalsPerWeek) % n
    for i = 0, math.min(P.community.goalsPerWeek, n) - 1 do
        picks[#picks + 1] = pool[((start + i) % n) + 1]
    end
    return picks, week
end

local function goalCounts(goal, week, license)
    local tableName, column, where, args = 'pastime_log', 'created_at', 'kind=?', { goal.source }
    if goal.source == 'fish' then
        tableName, column, where, args = 'fishing_catches', 'created_at', "rarity<>'junk'", {}
    elseif goal.source == 'stamp' then
        tableName, column, where, args = 'passport_discoveries', 'discovered_at', '1=1', {}
    elseif goal.source == 'cache' then
        tableName, column, where, args = 'activity_cache_finds', 'found_at', '1=1', {}
    end
    args[#args + 1] = week.startMs
    args[#args + 1] = week.endMs
    local base = ('SELECT COUNT(*) FROM %s WHERE %s AND %s>=? AND %s<?'):format(tableName, where, column, column)
    local total = scalar(base, args)
    local mine = 0
    if license then
        local mineArgs = { table.unpack(args) }
        mineArgs[#mineArgs + 1] = license
        mine = scalar(base .. ' AND license=?', mineArgs)
    end
    return total, mine
end

PS.sections.community = function(src)
    local s = sessions[src]
    local goals, week = activeGoals()
    local out = {}
    for _, goal in ipairs(goals) do
        local total, mine = goalCounts(goal, week, s and s.license or nil)
        local claimed = s and scalar('SELECT COUNT(*) FROM pastime_goal_claims WHERE week_key=? AND goal_id=? AND license=?', { week.key, goal.id, s.license }) > 0 or false
        out[#out + 1] = {
            id = goal.id, label = goal.label, description = goal.description, icon = goal.icon,
            target = goal.target, total = total, mine = mine, complete = total >= goal.target,
            claimed = claimed, reward = P.community.reward,
        }
    end
    return { goals = out, week = week.key, endsAt = week.endMs }
end

RegisterNetEvent('fbrp:pastimes:goal:claim', function(rawId)
    local src = source
    local s = sessions[src]
    if not s then return end
    local goals, week = activeGoals()
    local goal
    for _, g in ipairs(goals) do if g.id == tostring(rawId or '') then goal = g end end
    if not goal then return end
    local total, mine = goalCounts(goal, week, s.license)
    if total < goal.target then return notify(src, 'The community has not reached that goal yet.', 'error') end
    if mine < 1 then return notify(src, 'Contribute at least once to share the reward.', 'error') end
    local inserted = MySQL.update.await('INSERT IGNORE INTO pastime_goal_claims(week_key,goal_id,license,claimed_at) VALUES(?,?,?,?)', { week.key, goal.id, s.license, now() })
    if tonumber(inserted) ~= 1 then return notify(src, 'You already claimed this reward.', 'info') end
    PS.award(src, P.community.reward, 'community')
    notify(src, ('Community goal complete: %s · +%d Bay Rep'):format(goal.label, P.community.reward), 'success')
    PS.open(src)
end)

-- ───────────────────────── titles ─────────────────────────

RegisterNetEvent('fbrp:pastimes:title', function(rawId)
    local src = source
    local s = sessions[src]
    if not s then return end
    PS.ensure(src)
    local id = tostring(rawId or '')
    if id == '' then
        MySQL.update.await('UPDATE pastime_profiles SET title=NULL,updated_at=? WHERE license=?', { now(), s.license })
        notify(src, 'Title cleared.', 'info')
        return PS.open(src)
    end
    local def
    for _, a in ipairs(P.achievements) do if a.id == id and a.title then def = a end end
    if not def then return end
    local owned = scalar('SELECT COUNT(*) FROM pastime_achievements WHERE license=? AND achievement_id=?', { s.license, id }) > 0
    if not owned then return notify(src, 'You have not unlocked that title yet.', 'error') end
    MySQL.update.await('UPDATE pastime_profiles SET title=?,updated_at=? WHERE license=?', { def.title, now(), s.license })
    notify(src, ('Title set: %s'):format(def.title), 'success')
    PS.open(src)
end)

-- ───────────────────────── menu payload ─────────────────────────

local function profileSection(src)
    local s = sessions[src]
    local row = MySQL.single.await('SELECT * FROM pastime_profiles WHERE license=?', { s.license }) or {}
    local rep = tonumber(row.rep) or 0
    local level, nextLevel = PS.level(rep)
    local streak = tonumber(row.daily_streak) or 0
    local today = PS.dayKey()
    local claimedToday = row.last_daily_day == today
    local liveStreak = (row.last_daily_day == today or row.last_daily_day == PS.dayKey(-1)) and streak or 0
    local nextStreak = liveStreak + 1
    local D = P.daily
    local nextRep = D.base + math.min(D.maxStreakBonus, (nextStreak - 1) * D.perStreakDay) + (nextStreak % 7 == 0 and D.weeklyBonus or 0)
    local leaders = {}
    for _, r in ipairs(MySQL.query.await('SELECT name,rep,title FROM pastime_profiles ORDER BY rep DESC LIMIT 5')) do
        leaders[#leaders + 1] = { name = r.name, rep = tonumber(r.rep) or 0, title = r.title }
    end
    return {
        rep = rep, level = level.label, levelIndex = levelFor(rep),
        next = nextLevel and { rep = nextLevel.rep, label = nextLevel.label } or nil,
        floor = level.rep, title = row.title,
        stats = {
            jobs = tonumber(row.jobs_done) or 0, drops = tonumber(row.drops_won) or 0, skydives = tonumber(row.skydives) or 0,
            duels = (tonumber(row.duels_won) or 0) + (tonumber(row.duels_lost) or 0),
        },
        daily = { claimed = claimedToday, streak = liveStreak, nextRep = nextRep },
        leaders = leaders,
    }
end

local function achievementSection(src)
    local s = sessions[src]
    local st = statsFor(s.license)
    local have = {}
    for _, row in ipairs(MySQL.query.await('SELECT achievement_id,unlocked_at FROM pastime_achievements WHERE license=?', { s.license })) do
        have[row.achievement_id] = tonumber(row.unlocked_at) or 0
    end
    local out, unlocked = {}, 0
    for _, def in ipairs(P.achievements) do
        local value = st[def.stat] or 0
        local done = have[def.id] ~= nil
        if done then unlocked = unlocked + 1 end
        out[#out + 1] = {
            id = def.id, label = def.label, desc = def.desc, rep = def.rep, tier = def.tier, title = def.title,
            progress = math.min(def.target, value), target = def.target, unlocked = done,
        }
    end
    return { list = out, unlocked = unlocked, total = #P.achievements }
end

function PS.payload(src)
    local s = sessions[src]
    if not s then return nil end
    PS.ensure(src)
    PS.checkAchievements(src, true)
    local data = { profile = profileSection(src), achievements = achievementSection(src) }
    for name, build in pairs(PS.sections) do
        local ok, section = pcall(build, src)
        if ok then data[name] = section else print(('[FBRP] pastimes section %s failed: %s'):format(name, tostring(section))) end
    end
    return data
end

function PS.open(src)
    local data = PS.payload(src)
    if data then TriggerClientEvent('fbrp:pastimes:open', src, data) end
end

RegisterNetEvent('fbrp:pastimes:request', function() PS.open(source) end)

RegisterCommand('pastimes', function(source)
    if source > 0 then PS.open(source) end
end, false)

RegisterCommand('rep', function(source)
    if source <= 0 then return end
    local s = sessions[source]
    if not s then return end
    PS.ensure(source)
    local rep = scalar('SELECT rep FROM pastime_profiles WHERE license=?', { s.license })
    local level, nextLevel = PS.level(rep)
    chat(source, 'BAY REP', ('%s · %d rep%s'):format(level.label, rep, nextLevel and (' · %d to %s'):format(nextLevel.rep - rep, nextLevel.label) or ' · top rank'), { 255, 181, 71 })
end, false)

-- ───────────────────────── housekeeping ─────────────────────────

AddEventHandler('playerDropped', function()
    ensured[source] = nil
    lastCheck[source] = nil
end)

-- Fishing, passport stamps and geocaches live in older modules that have no
-- hook for this, so unlocks are swept on a timer for everyone online.
CreateThread(function()
    Wait(45000)
    while true do
        local online = {}
        for src in pairs(sessions) do online[#online + 1] = src end
        for _, src in ipairs(online) do
            if sessions[src] and GetPlayerPing(src) > 0 then
                pcall(PS.checkAchievements, src, false)
            end
            Wait(250)
        end
        Wait(120000)
    end
end)
