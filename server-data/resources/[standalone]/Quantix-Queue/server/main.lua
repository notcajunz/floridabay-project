local OnlinePlayers = {}

AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
    local src = source
    deferrals.defer()
    Wait(50)

    local license = Discord.GetIdentifier(src, "license")
    local discordId = Discord.GetIdentifier(src, "discord")
    local steamId = Discord.GetIdentifier(src, "steam")

    if Config.RequireLicense and not license then
        deferrals.done(Config.Messages.MissingLicense)
        return
    end

    if Config.RequireSteam and not steamId then
        deferrals.done(Config.Messages.MissingSteam)
        return
    end

    if Config.RequireDiscord and not discordId then
        deferrals.done(Config.Messages.MissingDiscord)
        return
    end

    Discord.GetMemberData(discordId, function(memberData)
        if not Discord.IsWhitelisted(memberData) then
            deferrals.done(Config.Messages.NotWhitelisted)
            return
        end

        local priority = Discord.ResolvePriority(memberData)
        local gracePriority = Queue.CheckGrace(license)
        if gracePriority then
            priority = gracePriority
            priority.bypassQueue = true
        end

        local username = (memberData and memberData.username) or name
        local avatarUrl = (memberData and memberData.avatarUrl) or Config.Screen.DefaultAvatarUrl

        local maxSlots = GetConvarInt("sv_maxclients", Config.MaxServerSlots)
        local activePlayers = GetNumPlayerIndices()
        local totalOccupied = activePlayers + Queue.GetConnectingCount()
        local availableSlots = maxSlots - totalOccupied
        local reservedThreshold = maxSlots - Config.ReservedSlots

        local canImmediateConnect = false

        if Queue.GetCount() == 0 then
            if priority.bypassQueue and availableSlots > 0 then
                canImmediateConnect = true
            elseif not priority.bypassQueue and totalOccupied < reservedThreshold then
                canImmediateConnect = true
            end
        end

        if canImmediateConnect then
            Queue.SetConnecting(license)
            OnlinePlayers[license] = {
                priority = priority,
                source = src
            }
            local holdSeconds = Config.MinQueueScreenSeconds or 0
            if holdSeconds > 0 then
                local cardData = {
                    username = username,
                    license = license,
                    avatarUrl = avatarUrl,
                    priorityName = priority.name,
                    priorityRank = priority.rank,
                    badgeColor = priority.badgeColor,
                    isBypass = priority.bypassQueue,
                    position = 1,
                    totalInQueue = 1,
                    activePlayers = activePlayers
                }
                pcall(function()
                    if Config.Screen.UseAdaptiveCard then
                        deferrals.presentCard(Card.Build(cardData), function() end)
                    else
                        deferrals.update(Card.BuildText(cardData))
                    end
                end)
                Wait(holdSeconds * 1000)
            end
            local connected = pcall(function()
                deferrals.update(Config.Messages.Connecting)
                Wait(250)
                deferrals.done()
            end)
            if not connected then
                Queue.RemoveConnecting(license)
                OnlinePlayers[license] = nil
            end
            return
        end

        local playerData = {
            source = src,
            name = name,
            username = username,
            avatarUrl = avatarUrl,
            license = license,
            discordId = discordId,
            steamId = steamId,
            deferrals = deferrals,
            priority = priority,
            joinedAt = os.time()
        }

        Queue.Add(playerData)

        local currentPosition = Queue.GetPosition(license) or 1
        local cardData = {
            username = username,
            license = license,
            avatarUrl = avatarUrl,
            priorityName = priority.name,
            priorityRank = priority.rank,
            badgeColor = priority.badgeColor,
            isBypass = priority.bypassQueue,
            position = currentPosition,
            totalInQueue = Queue.GetCount(),
            activePlayers = activePlayers
        }

        if Config.Screen.UseAdaptiveCard then
            local cardJson = Card.Build(cardData)
            pcall(function()
                deferrals.presentCard(cardJson, function() end)
            end)
        else
            deferrals.update(Card.BuildText(cardData))
        end
    end)
end)

Citizen.CreateThread(function()
    while true do
        Wait(Config.QueueTickInterval)

        Queue.PurgeStaleConnecting()
        Queue.PurgeStaleGrace()

        local maxSlots = GetConvarInt("sv_maxclients", Config.MaxServerSlots)
        local activePlayers = GetNumPlayerIndices()
        local totalOccupied = activePlayers + Queue.GetConnectingCount()
        local availableSlots = maxSlots - totalOccupied
        local reservedThreshold = maxSlots - Config.ReservedSlots

        if Queue.GetCount() > 0 and availableSlots > 0 then
            local candidate = Queue.List[1]
            if candidate then
                local isAllowed = false

                if candidate.priority.rank <= Config.ReservedSlotsMinRank or candidate.priority.bypassQueue then
                    if availableSlots > 0 then
                        isAllowed = true
                    end
                else
                    if totalOccupied < reservedThreshold then
                        isAllowed = true
                    end
                end

                if isAllowed then
                    local nextPlayer = Queue.Pop()
                    if nextPlayer then
                        Queue.SetConnecting(nextPlayer.license)
                        OnlinePlayers[nextPlayer.license] = {
                            priority = nextPlayer.priority,
                            source = nextPlayer.source
                        }

                        local connectSuccess = pcall(function()
                            nextPlayer.deferrals.update(Config.Messages.Connecting)
                            Wait(250)
                            nextPlayer.deferrals.done()
                        end)

                        if not connectSuccess then
                            Queue.RemoveConnecting(nextPlayer.license)
                            OnlinePlayers[nextPlayer.license] = nil
                        end
                    end
                end
            end
        end

        local totalInQueue = Queue.GetCount()
        local deadPlayers = {}

        for index, player in ipairs(Queue.List) do
            local cardData = {
                username = player.username,
                license = player.license,
                avatarUrl = player.avatarUrl,
                priorityName = player.priority.name,
                priorityRank = player.priority.rank,
                badgeColor = player.priority.badgeColor,
                isBypass = player.priority.bypassQueue,
                position = index,
                totalInQueue = totalInQueue,
                activePlayers = activePlayers
            }

            local updateSuccess = false

            if Config.Screen.UseAdaptiveCard then
                local cardJson = Card.Build(cardData)
                updateSuccess = pcall(function()
                    player.deferrals.presentCard(cardJson, function() end)
                end)
            else
                local message = Card.BuildText(cardData)
                updateSuccess = pcall(function()
                    player.deferrals.update(message)
                end)
            end

            if not updateSuccess then
                table.insert(deadPlayers, player.license)
            end
        end

        for _, deadLicense in ipairs(deadPlayers) do
            Queue.Remove(deadLicense)
        end
    end
end)

AddEventHandler('playerJoining', function()
    local src = source
    local license = Discord.GetIdentifier(src, "license")
    if license then
        Queue.RemoveConnecting(license)
        Queue.Remove(license)
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    local license = Discord.GetIdentifier(src, "license")
    if license then
        Queue.Remove(license)
        Queue.RemoveConnecting(license)
        if OnlinePlayers[license] then
            Queue.AddGrace(license, OnlinePlayers[license].priority)
            OnlinePlayers[license] = nil
        end
    else
        Queue.RemoveBySource(src)
    end
end)

RegisterCommand('queue_status', function(source)
    if source ~= 0 and not IsPlayerAceAllowed(source, "command.queue") then
        return
    end

    local maxSlots = GetConvarInt("sv_maxclients", Config.MaxServerSlots)
    local activePlayers = GetNumPlayerIndices()
    local connectingCount = Queue.GetConnectingCount()
    local queueCount = Queue.GetCount()

    print(string.format("[Quantix-Queue] Active: %d | Connecting: %d | Queued: %d | Max Slots: %d",
        activePlayers, connectingCount, queueCount, maxSlots))
end, true)

RegisterCommand('queue_clear', function(source)
    if source ~= 0 and not IsPlayerAceAllowed(source, "command.queue") then
        return
    end

    for _, player in ipairs(Queue.List) do
        pcall(function()
            player.deferrals.done("The server queue was cleared by an administrator.")
        end)
    end

    Queue.List = {}
    print("[Quantix-Queue] Queue has been cleared.")
end, true)

exports('GetQueue', function()
    return Queue.List
end)

exports('GetQueueCount', function()
    return Queue.GetCount()
end)

exports('GetPlayerQueuePosition', function(license)
    return Queue.GetPosition(license)
end)

exports('IsPlayerInQueue', function(license)
    return Queue.GetPosition(license) ~= nil
end)
