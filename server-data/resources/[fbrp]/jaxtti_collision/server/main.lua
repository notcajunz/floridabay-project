RegisterNetEvent('jaxtti_collision:crashed', function(tier, delta, belted, ejected)
    local src = source
    if type(tier) ~= 'string' then return end
    TriggerEvent('jaxtti_collision:server:crashed', src, tier, tonumber(delta) or 0, belted == true, ejected == true)
    if Config.Debug and (tier == 'severe' or tier == 'critical') then
        print(('[jaxtti_collision] %s (%s): %s crash, %s mph, belted=%s, ejected=%s'):format(
            GetPlayerName(src) or '?', src, tier, tostring(delta), tostring(belted), tostring(ejected)))
    end
end)
