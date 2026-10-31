-- Client side of vMenu character share codes. The vMenu build asks the server for a code and saves
-- imports itself, so this file only shows the code and lets players manage the codes they made.

RegisterNetEvent('fbrp:outfitshare:created', function(code, name)
    lib.setClipboard(code)
    lib.notify({
        title = 'Outfit share code',
        description = ('%s\n%s\nCopied to your clipboard. Anyone can import it from vMenu > Player Appearance > MP Characters > Saved Characters.'):format(code, name),
        type = 'success',
        duration = 20000
    })
end)

RegisterNetEvent('fbrp:outfitshare:codes', function(rows)
    if type(rows) ~= 'table' or #rows == 0 then
        return lib.notify({ title = 'Outfit share', description = 'You have no share codes. Create one from vMenu > Saved Characters.', type = 'info' })
    end
    local options = {}
    for _, row in ipairs(rows) do
        options[#options + 1] = {
            title = ('%s  ·  %s'):format(row.code, row.character_name),
            description = ('%d cop%s imported'):format(tonumber(row.copies) or 0, (tonumber(row.copies) or 0) == 1 and 'y' or 'ies'),
            icon = 'shirt',
            onSelect = function()
                local choice = lib.alertDialog({
                    header = row.code,
                    content = ('**%s**\n\nCopy this code to share it, or delete it so nobody can import it any more.'):format(row.character_name),
                    centered = true,
                    cancel = true,
                    labels = { confirm = 'Copy code', cancel = 'Delete code' }
                })
                if choice == 'confirm' then
                    lib.setClipboard(row.code)
                    lib.notify({ title = 'Outfit share', description = 'Code copied to your clipboard.', type = 'success' })
                elseif choice == 'cancel' then
                    TriggerServerEvent('fbrp:outfitshare:delete', row.code)
                end
            end
        }
    end
    lib.registerContext({ id = 'fbrp_outfit_codes', title = 'Your outfit share codes', options = options })
    lib.showContext('fbrp_outfit_codes')
end)

RegisterCommand('outfitcodes', function()
    TriggerServerEvent('fbrp:outfitshare:list')
end, false)

TriggerEvent('chat:addSuggestion', '/outfitcodes', 'List, copy or delete the vMenu character share codes you made')
