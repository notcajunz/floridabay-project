local function discordId(source)
    for _, value in ipairs(GetPlayerIdentifiers(tonumber(source))) do
        if value:sub(1,8) == 'discord:' then return value:sub(9) end
    end
end

local function decodeRoles(value)
    if not value then return false end
    if type(value) == 'table' then
        local output = {}
        for _, role in ipairs(value) do output[#output + 1] = tostring(role) end
        return output
    end
    local ok, roles = pcall(json.decode, value)
    if not ok or type(roles) ~= 'table' then return false end
    local output = {}
    for _, role in ipairs(roles) do output[#output + 1] = tostring(role) end
    return output
end

function GetDiscordRoles(source, guild)
    local discord = discordId(source)
    if not discord then return false end
    local guildId = guild and tostring(guild) or GetConvar('fbrp_mainGuild','')
    if guildId ~= '' then
        return decodeRoles(MySQL.scalar.await('SELECT roles FROM discord_member_cache WHERE guild_id=? AND discord_id=?', { guildId,discord }))
    end
    local seen, output = {}, {}
    for _, row in ipairs(MySQL.query.await('SELECT roles FROM discord_member_cache WHERE discord_id=?', {discord})) do
        for _, role in ipairs(decodeRoles(row.roles) or {}) do if not seen[role] then seen[role]=true; output[#output+1]=role end end
    end
    return #output > 0 and output or false
end

function ClearCache(_) return true end
function CheckEqual(a,b) return tostring(a)==tostring(b) end
function FetchRoleID(value)
    local id=tostring(value or '')
    return id:match('^%d+$') and id or nil
end

function GetRoleIdFromRoleName(name,guild)
    local guildId=guild and tostring(guild) or GetConvar('fbrp_mainGuild','')
    return MySQL.scalar.await('SELECT role_id FROM discord_guild_roles WHERE guild_id=? AND name=? LIMIT 1',{guildId,tostring(name or '')})
end

local function memberField(source,field)
    local discord=discordId(source); if not discord then return nil end
    local guild=GetConvar('fbrp_mainGuild','')
    return MySQL.scalar.await(('SELECT %s FROM discord_member_cache WHERE guild_id=? AND discord_id=?'):format(field),{guild,discord})
end
function GetDiscordName(source) return memberField(source,'username') end
function GetDiscordNickname(source) return memberField(source,'nickname') or memberField(source,'username') end
function GetDiscordAvatar(source) return memberField(source,'avatar') end
function GetGuildRoleList(guild)
    local guildId=guild and tostring(guild) or GetConvar('fbrp_mainGuild','')
    local result={}
    for _,row in ipairs(MySQL.query.await('SELECT role_id,name FROM discord_guild_roles WHERE guild_id=?',{guildId})) do result[row.name]=row.role_id end
    return result
end

