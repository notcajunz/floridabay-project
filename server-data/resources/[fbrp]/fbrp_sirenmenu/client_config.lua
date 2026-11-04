Config = {
    -- Default key to open the menu. Leave "" to let players bind it in Settings > Key Bindings.
    Keybind = "",

    -- Show the Florida Bay RP logo on screen while the menu is open.
    ShowLogo = false, -- no logo image ships with this menu

    -- Prints progress messages in the F8 console. Turn off once everything works.
    Debug = false,

    -- Ordered list of sirens shown in the menu.
    -- label = what players see | sound = the siren package key in lvc/SIRENS.lua
    -- (SIREN_ASSIGNMENTS). "DEFAULT" = go back to the vehicle's normal tones.
    Sirens = {
        { label = "Default (vehicle's normal)", sound = "DEFAULT" },
        { label = "Code 3 RLS",                 sound = "FB_RLS" },
        { label = "Whelen Gamma 2",             sound = "FB_GAMMA" },
        { label = "Fire / EMS",                 sound = "FB_FIREEMS" },
        { label = "Federal Signal PA4000",      sound = "FB_PA4000" },
        { label = "DX5 Powercall",              sound = "FB_DX5" },
        { label = "Whelen Cencom Sapphire",     sound = "FB_SAPPHIRE" },
        { label = "Federal Signal Smart Siren", sound = "FB_SMART" },
    },

    -- Keys used while the menu is open (you can keep driving; the menu is display-only).
    -- Default: Left/Right arrows browse, Enter applies, Backspace closes.
    -- Control IDs: 172 Up, 173 Down, 174 Left, 175 Right, 191 Enter, 194 Backspace.
    -- Full list: docs.fivem.net/docs/game-references/controls
    -- If one of these also triggers something in LVC (e.g. turn signals), change it here.
    Controls = { prev = 174, next = 175, apply = 191, close = 194 },

    Menu = {
        hint = "← → browse  •  Enter apply  •  Backspace close",
        title = "Florida Bay Siren Menu",
    },
}
