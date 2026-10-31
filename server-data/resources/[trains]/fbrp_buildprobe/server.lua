RegisterNetEvent('fbrp_buildprobe:report', function(build)
    if type(build) ~= 'number' then return end
    print(('[fbrp_buildprobe] %s game build %d | sv_enforceGameBuild=%d | server %s'):format(
        GetPlayerName(source) or source, build, GetConvarInt('sv_enforceGameBuild', 0), GetConvar('version', 'unknown')))
end)
