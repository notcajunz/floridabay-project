local configured_framework = Config.Bridge.Framework

if configured_framework == "auto" then
    if GetResourceState("fbrp_core") ~= "missing" then
        configured_framework = "fbrp"
    elseif GetResourceState("es_extended") == "started" then
        configured_framework = "esx"
    elseif GetResourceState("qbx_core") == "started" then
        configured_framework = "qbox"
    elseif GetResourceState("qb-core") == "started" then
        configured_framework = "qb"
    end
end

-- Florida Bay: "fbrp" is the standalone fbrp_core character framework (see FLORIDA_BAY.md).
if configured_framework ~= "esx" and configured_framework ~= "qbox" and configured_framework ~= "qb" and configured_framework ~= "fbrp" then
    error(("[sky_phone] Unsupported or unavailable framework '%s'."):format(tostring(configured_framework)))
end

Bridge.Framework.Name = configured_framework

function Bridge.Framework.GetName()
    return Bridge.Framework.Name
end
