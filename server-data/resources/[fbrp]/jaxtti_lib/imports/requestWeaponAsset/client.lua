return function(weapon, timeout, flags, extra)
    if type(weapon) ~= 'number' then weapon = joaat(weapon) end
    return lib.streamingRequest(function(w) RequestWeaponAsset(w, flags or 31, extra or 0) end,
        HasWeaponAssetLoaded, 'weapon', weapon, timeout)
end
