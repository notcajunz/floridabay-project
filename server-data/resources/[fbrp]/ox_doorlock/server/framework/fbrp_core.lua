-- fbrp_core bridge (Florida Bay) so door "groups" and "characters" work without ESX / QBX / ox_core.
--
-- A door's groups can be any of these (lowercase):
--   * an fbrp_core organisation slug you're on duty with (/duty), e.g.  { 'lspd', 'bcso' }
--   * an organisation type:  'leo' (any police dept), 'fire' (any Fire & EMS dept)
--   * 'staff' (clocked in with /clockin)
--   * any name you grant by ace:  add_ace group.something doorlock.group.<name> allow
-- Grades are ignored (fbrp_core organisations have no grades here).

local function core(name, ...)
	local args = { ... }
	local ok, result = pcall(function() return exports.fbrp_core[name](exports.fbrp_core, table.unpack(args)) end)
	return ok and result or nil
end

function GetPlayer(playerId)
	playerId = tonumber(playerId)
	if playerId and GetPlayerName(playerId) then return { source = playerId } end
end

function GetCharacterId(player)
	return tonumber(Player(player.source).state['fbrp:characterId'])
end

local function groupsOf(source)
	local names = {}
	local org = core('GetActiveOrganization', source)
	if type(org) == 'table' then
		if org.slug then names[tostring(org.slug):lower()] = true end
		if org.type then names[tostring(org.type):lower()] = true end
		if org.name then names[tostring(org.name):lower()] = true end
	end
	if core('IsStaffOnDuty', source) == true then names.staff = true end
	return names
end

---@param groups string | string[] | table<string, number>
function IsPlayerInGroup(player, groups)
	local source = player.source
	local mine = groupsOf(source)
	local function check(name)
		name = tostring(name):lower()
		if mine[name] or IsPlayerAceAllowed(source, ('doorlock.group.%s'):format(name)) then return name end
	end
	if type(groups) == 'string' then return check(groups) end
	if type(groups) ~= 'table' then return end
	for key, value in pairs(groups) do
		-- array { 'lspd', 'bcso' } or map { lspd = 0, bcso = 2 }
		local hit = check(type(key) == 'number' and value or key)
		if hit then return hit end
	end
end
