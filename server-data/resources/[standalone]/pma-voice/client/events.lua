isInitialized = false
local isInitializing = false

local function assignedVoiceChannel()
	local channel = tonumber(LocalPlayer.state.assignedChannel)
	if not channel or channel <= 0 then return nil end
	return math.floor(channel)
end

function handleInitialState()
	if isInitializing or not MumbleIsConnected() then return false end
	local assignedChannel = assignedVoiceChannel()
	if not assignedChannel then return false end
	isInitializing = true

	local voiceModeData = Cfg.voiceModes[mode]
	MumbleSetTalkerProximity(voiceModeData[1] + 0.0)
	MumbleClearVoiceTarget(voiceTarget)
	MumbleSetVoiceTarget(voiceTarget)
	MumbleSetVoiceChannel(assignedChannel)

	local timeout = GetGameTimer() + 5000
	while MumbleIsConnected() and MumbleGetVoiceChannelFromServerId(playerServerId) ~= assignedChannel
		and GetGameTimer() < timeout do
		Wait(100)
		MumbleSetVoiceChannel(assignedChannel)
	end

	if not MumbleIsConnected() or MumbleGetVoiceChannelFromServerId(playerServerId) ~= assignedChannel then
		isInitializing = false
		return false
	end
	isInitialized = true
	isInitializing = false
	MumbleAddVoiceTargetChannel(voiceTarget, assignedChannel)

	addNearbyPlayers()
	return true
end

AddEventHandler('mumbleConnected', function(address, isReconnecting)
	logger.info('Connected to mumble server with address of %s, is this a reconnect %s',
		GetConvarInt('voice_hideEndpoints', 1) == 1 and 'HIDDEN' or address, isReconnecting)

	logger.log('Connecting to mumble, setting targets.')
	-- don't try to set channel instantly, we're still getting data.
	local voiceModeData = Cfg.voiceModes[mode]
	LocalPlayer.state:set('proximity', {
		index = mode,
		distance = voiceModeData[1],
		mode = voiceModeData[2],
	}, true)

	if not handleInitialState() then
		logger.warn('Mumble connected before a voice channel was ready; initialization will retry.')
	end

	logger.log('Finished connection logic')
end)

AddEventHandler('mumbleDisconnected', function(address)
	isInitialized = false
	isInitializing = false
	logger.info('Disconnected from mumble server with address of %s',
		GetConvarInt('voice_hideEndpoints', 1) == 1 and 'HIDDEN' or address)
end)

-- The mumbleConnected event can fire before this resource and the replicated
-- assignedChannel state are ready. It is not replayed, which previously left
-- isInitialized false forever. This also repairs voice after a transient
-- Mumble channel loss without requiring every player to reconnect.
CreateThread(function()
	while true do
		Wait(isInitialized and 1000 or 250)
		if MumbleIsConnected() then
			local assignedChannel = assignedVoiceChannel()
			local currentChannel = MumbleGetVoiceChannelFromServerId(playerServerId)
			if assignedChannel and (not isInitialized or currentChannel ~= assignedChannel) then
				isInitialized = false
				handleInitialState()
			end
		elseif isInitialized then
			isInitialized = false
		end
	end
end)

-- TODO: Convert the last Cfg to a Convar, while still keeping it simple.
AddEventHandler('pma-voice:settingsCallback', function(cb)
	cb(Cfg)
end)
