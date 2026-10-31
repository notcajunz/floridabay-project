return function(asset, timeout)
    return lib.streamingRequest(RequestNamedPtfxAsset, HasNamedPtfxAssetLoaded, 'ptfx', asset, timeout)
end
