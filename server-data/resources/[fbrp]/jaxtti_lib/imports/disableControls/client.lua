local controls = {}

local function each(args, fn)
    for _, v in ipairs(args) do
        if type(v) == 'table' then
            for _, c in ipairs(v) do fn(c) end
        else
            fn(v)
        end
    end
end

local api = {}

function api:Add(...)
    each({ ... }, function(c) controls[c] = (controls[c] or 0) + 1 end)
end

function api:Remove(...)
    each({ ... }, function(c)
        if controls[c] then
            controls[c] = controls[c] - 1
            if controls[c] <= 0 then controls[c] = nil end
        end
    end)
end

function api:Clear(...)
    if select('#', ...) == 0 then controls = {} return end
    each({ ... }, function(c) controls[c] = nil end)
end

return setmetatable(api, {
    __call = function()
        for c in pairs(controls) do DisableControlAction(0, c, true) end
    end,
})
