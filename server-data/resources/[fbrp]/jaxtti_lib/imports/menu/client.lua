local DESIGN, OX = 'jaxtti_designlibrary', 'ox_lib'
local menus = {}
local openId = nil

local function started(res) return GetResourceState(res) == 'started' end
local function useDesign() return started(DESIGN) end
local function useOx() return not useDesign() and started(OX) end

local function valueLabel(v)
    if type(v) == 'table' then return tostring(v.label or v.value or '') end
    return tostring(v)
end

local function ctxId(id) return ('jaxtti_lib:menu:%s'):format(id) end

local show

local function choose(menu, index, scrollIndex)
    local opt = menu.data.options[index]
    if not opt then return end
    if opt.checked ~= nil then
        opt.checked = not opt.checked
        if menu.data.onCheck then menu.data.onCheck(index, opt.checked, opt.args) end
    elseif menu.cb then
        menu.cb(index, scrollIndex, opt.args)
    end
    if opt.close == false then
        show(menu.data.id)
    else
        openId = nil
    end
end

function show(id)
    local menu = menus[id]
    if not menu then
        return print(('^1[jaxtti_lib] menu "%s" is not registered^0'):format(tostring(id)))
    end
    if useOx() then
        openId = id
        return exports[OX]:showMenu(id)
    end
    if not useDesign() then
        return print('^3[jaxtti_lib] lib.showMenu needs jaxtti_designlibrary (or ox_lib) running.^0')
    end

    local ui = exports[DESIGN]
    local root = ctxId(id)
    local options = {}

    for i, opt in ipairs(menu.data.options or {}) do
        local entry = {
            title = opt.label or '',
            description = opt.description,
            icon = opt.icon,
            iconColor = opt.iconColor,
            disabled = opt.disabled,
        }

        if type(opt.values) == 'table' and #opt.values > 0 then
            local cur = menu.scroll[i] or opt.defaultIndex or 1
            entry.rightLabel = valueLabel(opt.values[cur])
            local sub = ('%s:%d'):format(root, i)
            local subOptions = {}
            for j, v in ipairs(opt.values) do
                subOptions[j] = {
                    title = valueLabel(v),
                    description = type(v) == 'table' and v.description or nil,
                    icon = j == cur and 'check' or nil,
                    onSelect = function()
                        menu.scroll[i] = j
                        if menu.data.onSideScroll then menu.data.onSideScroll(i, j, opt.args) end
                        choose(menu, i, j)
                    end,
                }
            end
            ui:registerContext({ id = sub, title = opt.label or menu.data.title, menu = root, options = subOptions })
            entry.menu = sub
        elseif opt.checked ~= nil then
            entry.rightLabel = opt.checked and 'On' or 'Off'
            entry.onSelect = function() choose(menu, i) end
        else
            entry.onSelect = function() choose(menu, i) end
        end

        options[i] = entry
    end

    ui:registerContext({
        id = root,
        title = menu.data.title or '',
        options = options,
        onExit = function()
            openId = nil
            if menu.data.onClose then menu.data.onClose() end
        end,
    })
    openId = id
    ui:showContext(root)
end

local function register(data, cb)
    if type(data) ~= 'table' or not data.id then error('lib.registerMenu: data.id is required', 2) end
    menus[data.id] = { data = data, cb = cb, scroll = {} }
    if useOx() then exports[OX]:registerMenu(data, cb) end
end

local function setOptions(id, options, index)
    local menu = menus[id]
    if not menu then return end
    if index then
        menu.data.options[index] = options
        menu.scroll[index] = nil
    else
        menu.data.options = options
        menu.scroll = {}
    end
    if useOx() then exports[OX]:setMenuOptions(id, options, index) end
end

local function hide(onExit)
    if not openId then return end
    local id = openId
    openId = nil
    if useOx() then return exports[OX]:hideMenu(onExit) end
    if useDesign() then exports[DESIGN]:hideContext(onExit == true) end
    local menu = menus[id]
    if onExit and menu and menu.data.onClose then menu.data.onClose() end
end

return {
    register = register,
    show = show,
    hide = hide,
    setOptions = setOptions,
    getOpen = function() return openId end,
}
