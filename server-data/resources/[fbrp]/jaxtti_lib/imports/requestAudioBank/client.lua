return function(bank, timeout)
    return lib.waitFor(function()
        if RequestScriptAudioBank(bank, false) then return bank end
    end, ("failed to load audio bank '%s'"):format(bank), timeout or 30000)
end
