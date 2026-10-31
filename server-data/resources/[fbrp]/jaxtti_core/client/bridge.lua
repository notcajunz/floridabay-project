Bridge = {}

local QBCore, ESX
local esxStatus = {}
local esxDead = false
local esxMoney = {}

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

local function emit(name, ...) TriggerEvent('jaxtti_core:client:' .. name, ...) end

function Bridge.playerData()
    local fw = Jaxtti.framework()
    if fw == 'qbx' then
        local ok, data = pcall(function() return exports.qbx_core:GetPlayerData() end)
        return ok and data or nil
    elseif fw == 'qb' then
        local core = qb()
        return core and core.Functions.GetPlayerData() or nil
    elseif fw == 'esx' then
        local core = esx()
        return core and core.GetPlayerData and core.GetPlayerData() or nil
    end
    return nil
end

function Bridge.isLoaded()
    local fw = Jaxtti.framework()
    if fw == 'qbx' then
        return LocalPlayer.state.isLoggedIn == true
    elseif fw == 'qb' then
        if LocalPlayer.state.isLoggedIn ~= nil then return LocalPlayer.state.isLoggedIn == true end
        local data = Bridge.playerData()
        return data ~= nil and data.citizenid ~= nil
    elseif fw == 'esx' then
        local core = esx()
        if core and core.IsPlayerLoaded then return core.IsPlayerLoaded() == true end
        return core ~= nil and core.PlayerLoaded == true
    end
    return NetworkIsSessionStarted() and LocalPlayer.state['jaxtti:loaded'] ~= false
end

function Bridge.isDead()
    local st = LocalPlayer.state
    if st.isDead or st.dead or st.inLastStand or st.knockedout then return true end
    if esxDead then return true end
    local ped = PlayerPedId()
    if IsEntityDead(ped) or IsPedFatallyInjured(ped) then return true end
    local fw = Jaxtti.framework()
    if fw == 'qbx' or fw == 'qb' then
        local data = Bridge.playerData()
        local meta = data and data.metadata
        return meta ~= nil and (meta.isdead == true or meta.inlaststand == true)
    end
    return false
end

function Bridge.getStatus(key)
    local v = LocalPlayer.state[key]
    if v ~= nil then return tonumber(v) end
    local fw = Jaxtti.framework()
    if fw == 'qbx' or fw == 'qb' then
        local data = Bridge.playerData()
        v = data and data.metadata and data.metadata[key]
        return tonumber(v)
    elseif fw == 'esx' then
        return esxStatus[key]
    end
    return nil
end

exports('GetPlayerData', Bridge.playerData)
exports('IsLoaded', Bridge.isLoaded)
exports('IsDead', Bridge.isDead)
exports('GetStatus', Bridge.getStatus)
exports('GainStress', function(amount) TriggerServerEvent('jaxtti_core:server:gainStress', amount) end)

RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function() emit('playerLoaded') end)
RegisterNetEvent('QBCore:Client:OnPlayerUnload', function() emit('playerUnloaded') end)
RegisterNetEvent('QBCore:Client:OnJobUpdate', function() emit('jobUpdated') end)
RegisterNetEvent('QBCore:Client:SetDuty', function() emit('jobUpdated') end)

local lastMoney = { key = nil, at = 0 }
local function moneyChange(account, amount, minus)
    if account ~= 'cash' and account ~= 'bank' then return end
    local key = ('%s:%s:%s'):format(account, amount, tostring(minus))
    local now = GetGameTimer()
    if lastMoney.key == key and now - lastMoney.at < 300 then return end
    lastMoney.key, lastMoney.at = key, now
    local change = tonumber(amount) or 0
    if minus then change = -change end
    emit('moneyChanged', account, change)
end

RegisterNetEvent('hud:client:OnMoneyChange', function(account, amount, isMinus)
    moneyChange(account, amount, isMinus)
end)
RegisterNetEvent('QBCore:Client:OnMoneyChange', function(account, amount, operation)
    if operation == 'set' then return emit('moneyChanged') end
    moneyChange(account, amount, operation == 'remove')
end)

local function rememberEsxAccounts(accounts)
    if type(accounts) ~= 'table' then return end
    for _, acc in pairs(accounts) do
        if type(acc) == 'table' and acc.name then esxMoney[acc.name] = acc.money end
    end
end

RegisterNetEvent('esx:playerLoaded', function(xPlayer)
    esxDead = false
    if type(xPlayer) == 'table' then rememberEsxAccounts(xPlayer.accounts) end
    emit('playerLoaded')
end)
RegisterNetEvent('esx:onPlayerLogout', function() emit('playerUnloaded') end)
RegisterNetEvent('esx:setJob', function() emit('jobUpdated') end)
RegisterNetEvent('esx:setAccountMoney', function(account)
    if type(account) ~= 'table' then return end
    local name = account.name == 'money' and 'cash' or account.name
    if name ~= 'cash' and name ~= 'bank' then return end
    local old = esxMoney[account.name]
    esxMoney[account.name] = account.money
    if old == nil then return emit('moneyChanged') end
    emit('moneyChanged', name, (account.money or 0) - old)
end)
RegisterNetEvent('esx_status:onTick', function(list)
    if type(list) ~= 'table' then return end
    for _, s in ipairs(list) do
        if s.name and s.percent then esxStatus[s.name] = s.percent end
    end
end)
AddEventHandler('esx:onPlayerDeath', function() esxDead = true end)
AddEventHandler('esx:onPlayerSpawn', function() esxDead = false end)

local function revived()
    esxDead = false
    emit('revived')
end
RegisterNetEvent('qbx_medical:client:playerRevived', revived)
RegisterNetEvent('hospital:client:Revive', revived)
RegisterNetEvent('esx_ambulancejob:revive', revived)

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(250) end
    Wait(1000)
    if Jaxtti.framework() == 'standalone' and Bridge.isLoaded() then emit('playerLoaded') end
end)
