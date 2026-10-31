Queue = {}
Queue.List = {}
Queue.Connecting = {}
Queue.GracePeriod = {}

function Queue.Sort()
    table.sort(Queue.List, function(a, b)
        if a.priority.rank ~= b.priority.rank then
            return a.priority.rank < b.priority.rank
        end
        if a.priority.bypassQueue ~= b.priority.bypassQueue then
            return a.priority.bypassQueue == true
        end
        return a.joinedAt < b.joinedAt
    end)
end

function Queue.Add(playerData)
    Queue.Remove(playerData.license)
    table.insert(Queue.List, playerData)
    Queue.Sort()
end

function Queue.Remove(license)
    if not license then return nil end
    for i, player in ipairs(Queue.List) do
        if player.license == license then
            return table.remove(Queue.List, i)
        end
    end
    return nil
end

function Queue.RemoveBySource(src)
    if not src then return nil end
    for i, player in ipairs(Queue.List) do
        if player.source == src then
            return table.remove(Queue.List, i)
        end
    end
    return nil
end

function Queue.GetPlayer(license)
    if not license then return nil end
    for _, player in ipairs(Queue.List) do
        if player.license == license then
            return player
        end
    end
    return nil
end

function Queue.GetPosition(license)
    if not license then return nil end
    for i, player in ipairs(Queue.List) do
        if player.license == license then
            return i
        end
    end
    return nil
end

function Queue.GetCount()
    return #Queue.List
end

function Queue.Pop()
    if #Queue.List == 0 then
        return nil
    end
    return table.remove(Queue.List, 1)
end

function Queue.SetConnecting(license)
    if license then
        Queue.Connecting[license] = os.time()
    end
end

function Queue.RemoveConnecting(license)
    if license then
        Queue.Connecting[license] = nil
    end
end

function Queue.GetConnectingCount()
    local count = 0
    for _ in pairs(Queue.Connecting) do
        count = count + 1
    end
    return count
end

function Queue.PurgeStaleConnecting()
    local currentTime = os.time()
    local timeout = Config.ConnectingTimeout or 60
    for license, startTime in pairs(Queue.Connecting) do
        if currentTime - startTime > timeout then
            Queue.Connecting[license] = nil
        end
    end
end

function Queue.AddGrace(license, priority)
    if not Config.GracePeriodEnabled or not license then
        return
    end
    Queue.GracePeriod[license] = {
        timestamp = os.time(),
        priority = priority
    }
end

function Queue.CheckGrace(license)
    if not Config.GracePeriodEnabled or not license then
        return nil
    end
    local grace = Queue.GracePeriod[license]
    if grace then
        local currentTime = os.time()
        if (currentTime - grace.timestamp) <= Config.GracePeriodSeconds then
            Queue.GracePeriod[license] = nil
            return grace.priority
        else
            Queue.GracePeriod[license] = nil
        end
    end
    return nil
end

function Queue.PurgeStaleGrace()
    local currentTime = os.time()
    local duration = Config.GracePeriodSeconds or 180
    for license, data in pairs(Queue.GracePeriod) do
        if currentTime - data.timestamp > duration then
            Queue.GracePeriod[license] = nil
        end
    end
end
