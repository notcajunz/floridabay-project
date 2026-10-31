Discord = {}
Discord.Cache = {}

function Discord.GetIdentifier(source, identifierType)
    local numIdentifiers = GetNumPlayerIdentifiers(source)
    for i = 0, numIdentifiers - 1 do
        local id = GetPlayerIdentifier(source, i)
        if id and string.sub(id, 1, string.len(identifierType)) == identifierType then
            return string.sub(id, string.len(identifierType) + 2)
        end
    end
    return nil
end

function Discord.GetAvatarUrl(discordId, avatarHash)
    if not avatarHash or avatarHash == "" then
        return Config.Screen.DefaultAvatarUrl
    end
    local format = "png"
    if string.sub(avatarHash, 1, 2) == "a_" then
        format = "gif"
    end
    return string.format("https://cdn.discordapp.com/avatars/%s/%s.%s?size=256", discordId, avatarHash, format)
end

function Discord.GetMemberData(discordId, callback)
    if not discordId then
        callback(nil)
        return
    end

    local currentTime = os.time()
    local cached = Discord.Cache[discordId]
    if cached and (currentTime - cached.timestamp < Config.DiscordCacheSeconds) then
        callback(cached.data)
        return
    end

    if not Config.DiscordBotToken or Config.DiscordBotToken == "" or Config.DiscordBotToken == "DISCORD_BOT_TOKEN_HERE" then
        local fallbackData = {
            roles = {},
            username = "Player",
            avatarUrl = Config.Screen.DefaultAvatarUrl
        }
        callback(fallbackData)
        return
    end

    local endpoint = string.format("https://discord.com/api/v10/guilds/%s/members/%s", Config.DiscordGuildId, discordId)
    local headers = {
        ["Authorization"] = "Bot " .. Config.DiscordBotToken,
        ["Content-Type"] = "application/json"
    }

    PerformHttpRequest(endpoint, function(statusCode, responseText, responseHeaders)
        if statusCode == 200 and responseText then
            local decoded = json.decode(responseText)
            if decoded then
                local userObj = decoded.user or {}
                local avatarHash = userObj.avatar
                local username = decoded.nick or userObj.global_name or userObj.username or "Player"
                local avatarUrl = Discord.GetAvatarUrl(discordId, avatarHash)
                local roles = decoded.roles or {}

                local memberData = {
                    roles = roles,
                    username = username,
                    avatarUrl = avatarUrl,
                    joinedDiscordAt = decoded.joined_at
                }

                Discord.Cache[discordId] = {
                    data = memberData,
                    timestamp = currentTime
                }

                callback(memberData)
                return
            end
        end

        callback(nil)
    end, "GET", "", headers)
end

function Discord.ResolvePriority(memberData)
    if not memberData or not memberData.roles or #memberData.roles == 0 then
        return {
            name = Config.DefaultRank.name,
            rank = Config.DefaultRank.rank,
            bypassQueue = Config.DefaultRank.bypassQueue,
            badgeColor = Config.DefaultRank.badgeColor
        }
    end

    local roleLookup = {}
    for _, roleId in ipairs(memberData.roles) do
        roleLookup[tostring(roleId)] = true
    end

    local bestPriority = nil
    for _, priorityRole in ipairs(Config.PriorityRoles) do
        if roleLookup[tostring(priorityRole.roleId)] then
            if not bestPriority or priorityRole.rank < bestPriority.rank then
                bestPriority = priorityRole
            end
        end
    end

    if bestPriority then
        return {
            name = bestPriority.name,
            rank = bestPriority.rank,
            bypassQueue = bestPriority.bypassQueue == true,
            badgeColor = bestPriority.badgeColor or "Default"
        }
    end

    return {
        name = Config.DefaultRank.name,
        rank = Config.DefaultRank.rank,
        bypassQueue = Config.DefaultRank.bypassQueue,
        badgeColor = Config.DefaultRank.badgeColor
    }
end

function Discord.IsWhitelisted(memberData)
    if not Config.WhitelistOnly then
        return true
    end

    if not memberData or not memberData.roles then
        return false
    end

    local roleLookup = {}
    for _, roleId in ipairs(memberData.roles) do
        roleLookup[tostring(roleId)] = true
    end

    for _, whitelistRoleId in ipairs(Config.WhitelistRoles) do
        if roleLookup[tostring(whitelistRoleId)] then
            return true
        end
    end

    for _, priorityRole in ipairs(Config.PriorityRoles) do
        if priorityRole.bypassQueue and roleLookup[tostring(priorityRole.roleId)] then
            return true
        end
    end

    return false
end
