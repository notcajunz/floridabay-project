--[[ IPL Loader
True = Enables MLO
False = Disables MLO

Additional Explanation:
- When you activate the MLOs, the script loads the MLO along with custom occlusions specifically designed for it.  
- When you deactivate the MLO, we add a blocker and full occlusions on the respective building(s).  

The occlusions will help you achieve a more stable game with FPS improvements.
]]

config = {                      -- This config enables or disables Mlo IPL
    ["Sandy_CarDealer"] = true,    -- Albany Car Dealer
    ["Sandy_LiquorBar"] = true, -- LiquorBar / The Rusty Tap
    ["Sandy_House"] = true,     -- All Houses Interiors
    ["Sandy_Motel"] = true,        -- Vanilla Motel
    ["Sandy_SealtonMotel"] = true, -- Sealton Motel
    ["Sandy_Burgershot"] = true,     -- Burgershot
} 

--[[ Entityset Loader
True = Enables Props
False = Disables Props

This config enables or disables mapping props in houses & motel rooms
]]

entityset_config = {
    --[[
############# IMPORTANT #############
Sandy_House are not configured correctly to remove props, so please leave the value set to true. We will provide an update shortly.
]]
    ["Sandy_House"] = true,        -- true or false
    ["Sandy_SealtonMotel"] = true, -- true or false
}