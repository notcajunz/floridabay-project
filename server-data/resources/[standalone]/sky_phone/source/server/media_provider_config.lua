SkyPhoneMediaProviderConfig = {}

local function trim_key(value)
    if type(value) ~= "string" then
        return ""
    end
    return value:match("^%s*(.-)%s*$")
end

-- Server-only convar set in the Git-ignored secrets.cfg, so the token never has
-- to be written into the tracked config/media.lua.
SkyPhoneMediaProviderConfig.FiveManageTokenConvar = "sky_phone_fivemanage_token"

function SkyPhoneMediaProviderConfig.FiveManageApiKey(override_key)
    local api_key = trim_key(override_key)
    if api_key ~= "" then
        return api_key
    end

    api_key = trim_key(Config.Media.FiveManage.ApiKey)
    if api_key ~= "" then
        return api_key
    end

    return trim_key(GetConvar(SkyPhoneMediaProviderConfig.FiveManageTokenConvar, ""))
end

function SkyPhoneMediaProviderConfig.FiveManageSetupHint()
    if Config.PhoneConfigurator.Enabled == true then
        return "Add a FiveManage V3 token with Media access to FiveManage.ApiKey in /phonepanel > Phone Configurator and save with the green check. The token applies immediately; config/media.lua is ignored while the Phone Configurator is enabled."
    end

    return "Add a FiveManage V3 token with Media access as `set sky_phone_fivemanage_token \"...\"` in secrets.cfg (or to Config.Media.FiveManage.ApiKey in config/media.lua) and restart sky_phone."
end
