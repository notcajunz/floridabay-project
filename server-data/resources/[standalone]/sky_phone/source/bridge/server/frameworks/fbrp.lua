-- Florida Bay Roleplay framework adapter.
--
-- fbrp_core is a standalone character framework: a player picks one of their
-- characters at spawn, and fbrp_core publishes it on the player's state bag
-- ("fbrp:characterId"). Every phone device, number, account, contact list and
-- setting is keyed by that character, so choosing another character gives the
-- player that character's own phone.
if Bridge.Framework.Name ~= "fbrp" then
    return
end

local CORE = "fbrp_core"
local characters = {}
local jobs = {}
local JOB_TTL_MS = 60000

-- Company/radio job names used in config.lua. One name per organization type
-- lets every law enforcement department share the police service line.
local JOB_BY_TYPE = {
    leo = "police",
    fire = "fire",
    government = "government",
    business = "business",
    gang = "gang",
    other = "organization",
}

local function character_id(source)
    local player = Player(tonumber(source))
    local value = player and player.state and player.state["fbrp:characterId"]
    value = tonumber(value)
    if not value or value < 1 or value % 1 ~= 0 then
        return nil
    end
    return value
end

local function character(source)
    local id = character_id(source)
    if not id then
        return nil
    end
    local cached = characters[source]
    if cached and cached.id == id then
        return cached
    end
    local rows = Bridge.Database.Query(
        "SELECT id,first_name,last_name,date_of_birth FROM characters WHERE id=? AND archived=FALSE LIMIT 1",
        { id }
    )
    local row = rows and rows[1]
    if not row then
        return nil
    end
    cached = { id = id, first = row.first_name, last = row.last_name, dob = row.date_of_birth }
    characters[source] = cached
    return cached
end

function Bridge.Framework.CharacterId(source)
    return character_id(source)
end

function Bridge.Framework.GetStatusData(source)
    local player = Player(tonumber(source))
    local state = player and player.state or {}
    return {
        dead = state["fbrp:downed"] == true,
        isHandcuffed = state["fbrp:restrained"] ~= nil and state["fbrp:restrained"] ~= false,
    }
end

function Bridge.Framework.GetPlayers()
    local players = {}
    for _, player_source in ipairs(GetPlayers()) do
        players[#players + 1] = tonumber(player_source)
    end
    return players
end

function Bridge.Framework.GetIdentifier(source)
    local id = character_id(source)
    return id and ("fbrp_char_%d"):format(id) or nil
end

-- Florida Bay has no personal money. Banking, billing and crypto are disabled in
-- config.lua; anything else that asks gets an empty wallet.
function Bridge.Framework.GetMoney()
    return 0
end

function Bridge.Framework.AddMoney()
    return false
end

function Bridge.Framework.RemoveMoney()
    return false
end

function Bridge.Framework.GetCharacterName(source)
    local row = character(source)
    if not row then
        return nil, nil
    end
    return row.first, row.last
end

function Bridge.Framework.GetFirstname(source)
    local row = character(source)
    return row and row.first or nil
end

function Bridge.Framework.GetLastname(source)
    local row = character(source)
    return row and row.last or nil
end

function Bridge.Framework.GetBirthdate(source)
    local row = character(source)
    return row and row.dob or nil
end

local function core_export(name, ...)
    if GetResourceState(CORE) ~= "started" then
        return nil
    end
    local ok, result = pcall(function(...)
        return exports[CORE][name](exports[CORE], ...)
    end, ...)
    return ok and result or nil
end

-- The phone job is the organization the player is clocked in to with /duty.
-- Grades follow the organization rank so company permissions line up:
-- 1 = on duty, 2 = rank level 50+, 3 = rank level 75+, 4 = leader.
function Bridge.Framework.GetJob(source)
    local org = core_export("GetActiveOrganization", tonumber(source))
    if type(org) ~= "table" or not org.id then
        jobs[source] = nil
        return { name = "unemployed", label = "Civilian", grade = 0, gradeLabel = "Civilian", onDuty = false }
    end

    local cached = jobs[source]
    local now = GetGameTimer()
    if not cached or cached.org ~= org.id or now - cached.at > JOB_TTL_MS then
        local grade, label = 1, "Member"
        local discord = core_export("GetPlayerDiscord", tonumber(source))
        if discord then
            local rows = Bridge.Database.Query([[
                SELECT m.manager,r.name rank_name,r.level
                  FROM organization_members m
                  LEFT JOIN org_ranks r ON r.id=m.rank_id AND r.org_id=m.org_id
                 WHERE m.org_id=? AND m.discord_id=? LIMIT 1
            ]], { tonumber(org.id), tostring(discord) })
            local row = rows and rows[1]
            if row then
                local level = tonumber(row.level) or 0
                if row.manager == true or tonumber(row.manager) == 1 then
                    grade, label = 4, "Leader"
                elseif level >= 75 then
                    grade, label = 3, row.rank_name or label
                elseif level >= 50 then
                    grade, label = 2, row.rank_name or label
                elseif row.rank_name then
                    label = row.rank_name
                end
            end
        end
        cached = { org = org.id, at = now, grade = grade, label = label }
        jobs[source] = cached
    end

    return {
        name = JOB_BY_TYPE[org.type] or "organization",
        label = tostring(org.name or "Organization"),
        grade = cached.grade,
        gradeLabel = cached.label,
        onDuty = true,
    }
end

function Bridge.Framework.RegisterUsableItem()
    return false
end

-- fbrp_core announces every character selection. Drop the previous character's
-- open phone, then give the new character its device and number right away so
-- it can be called and messaged before it opens the phone for the first time.
AddEventHandler("fbrp:characterSelected", function(player_source, id, info)
    if GetInvokingResource() ~= CORE then
        return
    end
    player_source = tonumber(player_source)
    id = tonumber(id)
    if not player_source or not id then
        return
    end
    jobs[player_source] = nil
    if type(info) == "table" then
        characters[player_source] = { id = id, first = info.firstName, last = info.lastName, dob = info.dateOfBirth }
    else
        characters[player_source] = nil
    end
    TriggerEvent("sky_phone:fbrp:characterChanged", player_source)

    CreateThread(function()
        for _ = 1, 120 do
            if SkyPhone and SkyPhone.ProvisionCharacter then
                break
            end
            Wait(500)
        end
        if not (SkyPhone and SkyPhone.ProvisionCharacter) or character_id(player_source) ~= id then
            return
        end
        local ok, number = pcall(SkyPhone.ProvisionCharacter, player_source)
        if not ok then
            Bridge.Debug("error", "[sky_phone] Could not provision the phone of character %s: %s", tostring(id), tostring(number))
            return
        end
        if number and character_id(player_source) == id then
            TriggerEvent("fbrp:phone:number", player_source, id, number)
        end
    end)
end)

-- Keep the citizen record (ID card, MDT phone lookup) on the character's real number.
AddEventHandler("sky_phone:server:phoneNumberChanged", function(player_source, number)
    local id = character_id(player_source)
    if id and number then
        TriggerEvent("fbrp:phone:number", player_source, id, number)
    end
end)

AddEventHandler("playerDropped", function()
    characters[source] = nil
    jobs[source] = nil
end)
