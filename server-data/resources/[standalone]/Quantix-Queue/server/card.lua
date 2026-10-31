Card = {}

function Card.FormatTime(seconds)
    if seconds <= 0 then
        return "Immediate"
    elseif seconds < 60 then
        return "< 1 minute"
    else
        local minutes = math.ceil(seconds / 60)
        if minutes == 1 then
            return "~1 minute"
        else
            return string.format("~%d minutes", minutes)
        end
    end
end

-- The waiting queue, in order, with each player's rank. The viewer's own row is highlighted.
function Card.BuildQueueList(data)
    if Config.Screen.ShowQueueList == false or #Queue.List == 0 then
        return nil
    end

    local maxRows = Config.Screen.MaxListedPlayers or 20
    local rows = {
        {
            type = "TextBlock",
            text = string.format(Config.Screen.QueueListHeading or "Queue (%d waiting)", #Queue.List),
            weight = "Bolder",
            size = "Small",
            color = "Accent"
        }
    }

    for index, player in ipairs(Queue.List) do
        if index > maxRows then
            table.insert(rows, {
                type = "TextBlock",
                text = string.format("+ %d more waiting", #Queue.List - maxRows),
                size = "Small",
                isSubtle = true,
                spacing = "Small"
            })
            break
        end

        local isSelf = data.license ~= nil and player.license == data.license
        table.insert(rows, {
            type = "ColumnSet",
            spacing = "None",
            columns = {
                {
                    type = "Column",
                    width = "30px",
                    items = {{ type = "TextBlock", text = string.format("#%d", index), size = "Small", weight = isSelf and "Bolder" or "Default" }}
                },
                {
                    type = "Column",
                    width = "stretch",
                    items = {{ type = "TextBlock", text = player.username or player.name or "Player", size = "Small", weight = isSelf and "Bolder" or "Default", color = isSelf and "Accent" or "Default", wrap = false }}
                },
                {
                    type = "Column",
                    width = "auto",
                    items = {{ type = "TextBlock", text = (player.priority and player.priority.name) or Config.DefaultRank.name, size = "Small", color = (player.priority and player.priority.badgeColor) or "Default", horizontalAlignment = "Right" }}
                }
            }
        })
    end

    return {
        type = "Container",
        style = "emphasis",
        spacing = "Medium",
        items = rows
    }
end

function Card.Build(data)
    local bodyItems = {}

    if Config.Screen.ShowServerBanner and Config.Screen.BannerUrl and Config.Screen.BannerUrl ~= "" then
        table.insert(bodyItems, {
            type = "Image",
            url = Config.Screen.BannerUrl,
            size = "Large",
            horizontalAlignment = "Center"
        })
    end

    if Config.Screen.ShowServerName and Config.Screen.CustomServerTitle and Config.Screen.CustomServerTitle ~= "" then
        table.insert(bodyItems, {
            type = "TextBlock",
            text = Config.Screen.CustomServerTitle,
            weight = "Bolder",
            size = "Large",
            horizontalAlignment = "Center",
            spacing = "Medium"
        })
    end

    local profileColumns = {}
    if Config.Screen.ShowDiscordAvatar then
        table.insert(profileColumns, {
            type = "Column",
            width = "auto",
            items = {
                {
                    type = "Image",
                    url = data.avatarUrl or Config.Screen.DefaultAvatarUrl,
                    size = "Medium",
                    style = "Person"
                }
            }
        })
    end

    local userDetailsItems = {}
    if Config.Screen.ShowUsername then
        table.insert(userDetailsItems, {
            type = "TextBlock",
            text = (Config.Screen.UsernamePrefix or "") .. (data.username or "Player"),
            weight = "Bolder",
            size = "Medium"
        })
    end

    if Config.Screen.ShowPriorityBadge then
        local priorityDisplayText = data.priorityName or Config.DefaultRank.name
        if Config.Screen.ShowPriorityRankOrder and data.priorityRank then
            if data.isBypass then
                priorityDisplayText = string.format("%s (Bypass - Rank %d)", priorityDisplayText, data.priorityRank)
            else
                priorityDisplayText = string.format("%s (Priority Rank %d)", priorityDisplayText, data.priorityRank)
            end
        end

        table.insert(userDetailsItems, {
            type = "TextBlock",
            text = priorityDisplayText,
            color = data.badgeColor or "Default",
            weight = "Bolder",
            spacing = "None",
            size = "Small"
        })
    end

    if #userDetailsItems > 0 then
        table.insert(profileColumns, {
            type = "Column",
            width = "stretch",
            items = userDetailsItems
        })
    end

    if #profileColumns > 0 then
        table.insert(bodyItems, {
            type = "Container",
            style = "emphasis",
            spacing = "Medium",
            items = {
                {
                    type = "ColumnSet",
                    columns = profileColumns
                }
            }
        })
    end

    local facts = {}

    if Config.Screen.ShowQueuePosition then
        local posText = string.format("#%d", data.position)
        if Config.Screen.ShowTotalInQueue and data.totalInQueue then
            posText = string.format("#%d of %d", data.position, data.totalInQueue)
        end
        table.insert(facts, {
            title = Config.Screen.QueuePositionLabel or "Queue Position",
            value = posText
        })
    elseif Config.Screen.ShowTotalInQueue and data.totalInQueue then
        table.insert(facts, {
            title = Config.Screen.TotalInQueueLabel or "Players Waiting",
            value = tostring(data.totalInQueue)
        })
    end

    if Config.Screen.ShowPriorityBadge then
        table.insert(facts, {
            title = Config.Screen.PriorityLabel or "Bypass Status",
            value = data.priorityName or Config.DefaultRank.name
        })
    end

    if Config.Screen.ShowEstimatedWaitTime then
        local waitSeconds = (data.position or 1) * (Config.Screen.SecondsPerSlotEstimate or 40)
        table.insert(facts, {
            title = Config.Screen.EstimatedWaitTimeLabel or "Est. Wait Time",
            value = Card.FormatTime(waitSeconds)
        })
    end

    if Config.Screen.ShowServerSlots and data.activePlayers and Config.MaxServerSlots then
        table.insert(facts, {
            title = Config.Screen.ServerSlotsLabel or "Server Population",
            value = string.format("%d / %d", data.activePlayers, Config.MaxServerSlots)
        })
    end

    if #facts > 0 then
        table.insert(bodyItems, {
            type = "Container",
            spacing = "Medium",
            items = {
                {
                    type = "FactSet",
                    facts = facts
                }
            }
        })
    end

    local listRows = Card.BuildQueueList(data)
    if listRows then
        table.insert(bodyItems, listRows)
    end

    if Config.Screen.ShowAnnouncement then
        local announcementItems = {}
        if Config.Screen.AnnouncementHeading and Config.Screen.AnnouncementHeading ~= "" then
            table.insert(announcementItems, {
                type = "TextBlock",
                text = Config.Screen.AnnouncementHeading,
                weight = "Bolder",
                size = "Small",
                color = "Accent"
            })
        end
        if Config.Screen.AnnouncementMessage and Config.Screen.AnnouncementMessage ~= "" then
            table.insert(announcementItems, {
                type = "TextBlock",
                text = Config.Screen.AnnouncementMessage,
                wrap = true,
                size = "Small",
                spacing = "None"
            })
        end
        if #announcementItems > 0 then
            table.insert(bodyItems, {
                type = "Container",
                style = "emphasis",
                spacing = "Medium",
                items = announcementItems
            })
        end
    end

    local actionButtons = {}

    if Config.Screen.ShowDiscordButton and Config.Screen.DiscordInviteUrl and Config.Screen.DiscordInviteUrl ~= "" then
        table.insert(actionButtons, {
            type = "Action.OpenUrl",
            title = Config.Screen.DiscordButtonLabel or "Discord",
            url = Config.Screen.DiscordInviteUrl
        })
    end

    if Config.Screen.ShowWebsiteButton and Config.Screen.WebsiteUrl and Config.Screen.WebsiteUrl ~= "" then
        table.insert(actionButtons, {
            type = "Action.OpenUrl",
            title = Config.Screen.WebsiteButtonLabel or "Website",
            url = Config.Screen.WebsiteUrl
        })
    end

    if Config.Screen.ShowStoreButton and Config.Screen.StoreUrl and Config.Screen.StoreUrl ~= "" then
        table.insert(actionButtons, {
            type = "Action.OpenUrl",
            title = Config.Screen.StoreButtonLabel or "VIP Store",
            url = Config.Screen.StoreUrl
        })
    end

    local cardStructure = {
        ["$schema"] = "http://adaptivecards.io/schemas/adaptive-card.json",
        type = "AdaptiveCard",
        version = "1.3",
        body = bodyItems,
        actions = actionButtons
    }

    return json.encode(cardStructure)
end

function Card.BuildText(data)
    local waitSeconds = (data.position or 1) * (Config.Screen.SecondsPerSlotEstimate or 40)
    local timeText = Card.FormatTime(waitSeconds)
    return string.format(
        Config.Messages.QueuePositionText or "Queue Position: %s of %s | Priority: %s (Rank %s) | Estimated: %s",
        tostring(data.position),
        tostring(data.totalInQueue),
        tostring(data.priorityName),
        tostring(data.priorityRank),
        timeText
    )
end
