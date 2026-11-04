-- LEO / fire identification cards (ported from the Jaxtti tag resource's idcard module).
local cfg = TagsConfig

RegisterNetEvent('fbrp_tags:showBadge', function(card)
    if type(card) ~= 'table' then return end
    SendNUIMessage({
        type = 'showleoid',
        show = true,
        dep_img = card.logo or '',
        dep_name = card.department,
        rank = card.rank,
        name = card.name,
        callsign = card.callsign or '',
        duration = cfg.badgeSeconds
    })
end)

TriggerEvent('chat:addSuggestion', '/showbadge', 'Show your LEO / fire ID card', {
    { name = 'ID', help = 'Player to show it to (leave empty for everyone nearby)' }
})
