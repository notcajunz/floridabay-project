return function(ped, dict, clip, opts)
    opts = opts or {}
    lib.requestAnimDict(dict)
    TaskPlayAnim(ped, dict, clip, opts.blendIn or 8.0, opts.blendOut or -8.0, opts.duration or -1,
        opts.flag or 0, opts.rate or 0.0, false, false, false)
    RemoveAnimDict(dict)
end
