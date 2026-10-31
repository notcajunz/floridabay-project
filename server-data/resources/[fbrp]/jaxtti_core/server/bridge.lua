Bridge = {}

local QBCore, ESX

local function qb()
    if not QBCore then
        local ok, obj = pcall(function() return exports['qb-core']:GetCoreObject() end)
        QBCore = ok and obj or nil
    end
    return QBCore
end

local function esx()
    if not ESX then
        local ok, obj = pcall(function() return exports.es_extended:getSharedObject() end)
        ESX = ok and obj or nil
    end
    return ESX
end

local function getPlayer(src)
    local fw = Jaxtti.framework()
    if fw == 'qbx' then
        local ok, p = pcall(function() return exports.qbx_core:GetPlayer(src) end)
        return ok and p or nil, fw
    elseif fw == 'qb' then
        local core = qb()
        return core and core.Functions.GetPlayer(src) or nil, fw
    elseif fw == 'esx' then
        local core = esx()
        return core and core.GetPlayerFromId(src) or nil, fw
    end
    return nil, fw
end
Bridge.getPlayer = getPlayer

function Bridge.getPlayerInfo(src)
    src = tonumber(src)
    local out = {}
    if not src then return out end
    local player, fw = getPlayer(src)

    if (fw == 'qbx' or fw == 'qb') and player then
        local data = player.PlayerData
        out.cash = data.money and data.money.cash or 0
        out.bank = data.money and data.money.bank or 0
        local job = data.job
        if job then
            out.job = {
                name = job.name,
                label = job.label,
                grade = type(job.grade) == 'table' and (job.grade.name or '') or '',
                onDuty = job.onduty == true,
            }
        end
    elseif fw == 'esx' and player then
        local cash = player.getAccount and player.getAccount('money')
        local bank = player.getAccount and player.getAccount('bank')
        out.cash = cash and cash.money or (player.getMoney and player.getMoney()) or 0
        out.bank = bank and bank.money or 0
        local job = player.getJob and player.getJob() or player.job
        if job then
            out.job = {
                name = job.name,
                label = job.label,
                grade = job.grade_label or '',
                onDuty = job.onDuty == nil and true or job.onDuty == true,
            }
        end
    else
        local st = Player(src).state
        out.cash = st['jaxtti:cash']
        out.bank = st['jaxtti:bank']
        local job = st['jaxtti:job']
        if type(job) == 'table' then out.job = job end
    end

    return out
end

function Bridge.setStatus(src, key, value)
    src = tonumber(src)
    if not src then return end
    value = math.max(0, math.min(100, tonumber(value) or 0))
    local player, fw = getPlayer(src)
    if (fw == 'qbx' or fw == 'qb') and player and player.Functions and player.Functions.SetMetaData then
        player.Functions.SetMetaData(key, value)
    end
    Player(src).state:set(key, value, true)
end

function Bridge.getStatus(src, key)
    src = tonumber(src)
    if not src then return nil end
    local v = Player(src).state[key]
    if v ~= nil then return tonumber(v) end
    local player, fw = getPlayer(src)
    if (fw == 'qbx' or fw == 'qb') and player then
        local meta = player.PlayerData.metadata
        return meta and tonumber(meta[key]) or nil
    end
    return nil
end

function Bridge.addStress(src, amount)
    amount = tonumber(amount) or 0
    if amount == 0 then return end
    Bridge.setStatus(src, 'stress', (Bridge.getStatus(src, 'stress') or 0) + amount)
end

function Bridge.setMoney(src, account, amount)
    src = tonumber(src)
    if not src or (account ~= 'cash' and account ~= 'bank') then return end
    amount = math.floor(tonumber(amount) or 0)
    local key = 'jaxtti:' .. account
    local old = Player(src).state[key] or 0
    Player(src).state:set(key, amount, true)
    TriggerClientEvent('jaxtti_core:client:moneyChanged', src, account, amount - old)
end

function Bridge.addMoney(src, account, amount)
    local key = 'jaxtti:' .. tostring(account)
    Bridge.setMoney(src, account, (Player(tonumber(src)).state[key] or 0) + (tonumber(amount) or 0))
end

function Bridge.setJob(src, job)
    src = tonumber(src)
    if not src then return end
    if job ~= nil and type(job) ~= 'table' then return end
    Player(src).state:set('jaxtti:job', job, true)
    TriggerClientEvent('jaxtti_core:client:jobUpdated', src)
end

function Bridge.setLoaded(src, loaded)
    src = tonumber(src)
    if not src then return end
    Player(src).state:set('jaxtti:loaded', loaded == true, true)
    TriggerClientEvent(loaded and 'jaxtti_core:client:playerLoaded' or 'jaxtti_core:client:playerUnloaded', src)
end

exports('GetPlayerInfo', Bridge.getPlayerInfo)
exports('GetStatus', Bridge.getStatus)
exports('SetStatus', Bridge.setStatus)
exports('AddStress', Bridge.addStress)
exports('RemoveStress', function(src, amount) Bridge.addStress(src, -(tonumber(amount) or 0)) end)
exports('SetMoney', Bridge.setMoney)
exports('AddMoney', Bridge.addMoney)
exports('SetJob', Bridge.setJob)
exports('SetLoaded', Bridge.setLoaded)

RegisterNetEvent('jaxtti_core:server:gainStress', function(amount)
    amount = tonumber(amount) or 0
    if amount <= 0 then return end
    Bridge.addStress(source, math.min(amount, 25))
end)
