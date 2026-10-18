-- Florida Bay Roleplay has no item inventory. A player carries exactly one
-- phone once they have selected a character, and that phone is the character's
-- persistent device (Config.Phone.Unique = false, metadata-free).
if Bridge.Inventory.Name ~= "fbrp" then
    return
end

local function phone_slot(source)
    if not Bridge.Framework.CharacterId(source) then
        return nil
    end
    return {
        name = Config.Phone.Item,
        slot = 1,
        count = 1,
        amount = 1,
        metadata = {},
    }
end

function Bridge.Inventory.GetResourceName()
    return "fbrp_core"
end

function Bridge.Inventory.GetSlot(source, slot_id)
    if tonumber(slot_id) ~= 1 then
        return nil
    end
    return phone_slot(source)
end

function Bridge.Inventory.GetSlotsWithItem(source, item_name, metadata)
    if item_name ~= Config.Phone.Item or (type(metadata) == "table" and next(metadata) ~= nil) then
        return {}
    end
    local slot = phone_slot(source)
    return slot and { slot } or {}
end

function Bridge.Inventory.SetSlotMetadata()
    return false
end

function Bridge.Inventory.CanCarryItem()
    return false
end

function Bridge.Inventory.AddItem()
    return false
end

function Bridge.Inventory.RemoveItem()
    return 0
end

-- There is no item to use: the phone opens with its keybind or /phone. Report
-- success so the phone's item registration does not abort startup.
function Bridge.Inventory.RegisterUsableItem()
    return true
end
