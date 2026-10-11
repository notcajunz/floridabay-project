local applied={}

local function discordId(source)
    for _,value in ipairs(GetPlayerIdentifiers(source)) do if value:sub(1,8)=='discord:' then return value:sub(9) end end
end

local function refresh(source)
    source=tonumber(source); local discord=discordId(source); if not discord then return end
    local guild=GetConvar('fbrp_mainGuild',''); if guild=='' then return end
    local wanted={}
    for _,row in ipairs(MySQL.query.await([[
        SELECT DISTINCT b.group_name FROM discord_role_bindings b
        JOIN ace_groups g ON g.name=b.group_name AND g.staff_only=FALSE
        JOIN discord_member_cache c ON c.guild_id=b.guild_id AND c.discord_id=?
        WHERE b.guild_id=? AND JSON_CONTAINS(c.roles,JSON_QUOTE(b.role_id))
    ]],{discord,guild})) do wanted[row.group_name]=true end
    applied[source]=applied[source] or {}
    for name in pairs(applied[source]) do if not wanted[name] then ExecuteCommand(('remove_principal player.%d group.fbrp_%s'):format(source,name));applied[source][name]=nil end end
    for name in pairs(wanted) do if not applied[source][name] then ExecuteCommand(('add_principal player.%d group.fbrp_%s'):format(source,name));applied[source][name]=true end end
end

AddEventHandler('playerJoining',function() local src=source;SetTimeout(1500,function()refresh(src)end) end)
AddEventHandler('playerDropped',function() applied[source]=nil end)
RegisterNetEvent('DiscordAcePerms:Refresh',function()refresh(source)end)
RegisterCommand('refreshDiscordAce',function(source)if source>0 then refresh(source) end end,false)

CreateThread(function()
    while true do Wait(30000);for _,source in ipairs(GetPlayers()) do refresh(tonumber(source)) end end
end)
