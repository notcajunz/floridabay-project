-- Bridge between the mMulticharacter NUI and fbrp_core. fbrp_core owns the data
-- (characters, character_profiles, the MDT) and the events below; this file only
-- shows its payload on the CodeM screens and sends the player's choices back.
--
--   server -> client  fbrp:characters:data    the player's characters (SetChars)
--                     fbrp:characters:spawns  a character was picked (spawn page + birdseye preview)
--   client -> server  fbrp:characters:request / create / update / select
--   fbrp_core does the actual spawn (export SpawnAt) and reports back with
--   fbrp:characters:placed / fbrp:characters:spawnFailed.

local nuiReady = false
local visible = false
local lastPayload = nil
local awaitingCreate = false
local spawnCam = nil
local spawnTarget = nil
local orbit = 0.0

local function nui(payload)
    SendNUIMessage(payload)
end

local function playtime(seconds)
    seconds = math.max(0, math.floor(tonumber(seconds) or 0))
    local hours = seconds // 3600
    local minutes = (seconds % 3600) // 60
    if hours > 0 then return ('%dh %dm'):format(hours, minutes) end
    return ('%dm'):format(minutes)
end

local function text(value, fallback)
    value = tostring(value or '')
    return value ~= '' and value or fallback
end

local function locales()
    return {
        mainTitle = 'Character Selection',
        tebexPopUpTitle = 'Unlock a character slot',
        tebexPopUpButton = 'Unlock slot',
        deletePopUpTitle = 'Delete this character?',
        deletePopUpTitle2 = "This can't be undone.",
        deleteTitle = 'Delete character',
        hello = 'Hello',
        selectchar = 'Please select a character',
        cityAwait = 'City awaits you!',
        createYourNow = 'Create your character now!',
        selected = 'Selected',
        noButton = 'Cancel',
        yesButton = 'Delete',
        createNewTitle = 'Create new character',
        playButton = 'PLAY',
        playNowText = "You'll choose where to spawn next",
        statisticsTitle = 'Character Statistics',
        nationalityTitle = 'Nationality',
        numberTitle = 'Phone',
        cashTitle = 'State ID',
        bankTitle = 'Height',
        ageTitle = 'Age',
        registerTitle = 'Character Register',
        newCharacterTitle = 'New character',
        registerError = 'Please fill the blanks correctly!',
        registerVerify = 'Creating your character...',
        nameInput = 'First name',
        surnameInput = 'Last name',
        nationalityInput = 'Nationality',
        birthdateInput = 'Birthdate',
        heightInput = 'Height (cm)',
        maleInput = 'MALE',
        femaleInput = 'FEMALE',
        createButton = 'CREATE',
        editTitle = 'Edit character',
        editCharacterTitle = 'Edit character',
        saveButton = 'SAVE',
        cancelButton = 'Cancel',
        spawnTitle = 'Spawn Selection',
        spawnSelect = 'Choose where to spawn',
        spawnViewing = 'Viewing',
        spawnPickHint = 'Select a location to preview it from above',
        spawnConfirmHint = 'Ready when you are. Confirm to spawn here!',
        spawnButton = 'SPAWN',
    }
end

-- The screens find a character's slot from the 5th character of its identifier ("char2:..").
local function toScreen(payload)
    local out = {}
    for index, row in ipairs(payload.characters or {}) do
        out[#out + 1] = {
            id = row.id,
            identifier = ('char%d:%d'):format(index, row.id),
            firstname = row.first_name,
            lastname = row.last_name,
            dateofbirth = row.date_of_birth,
            sex = row.gender,
            job = 'civilian',
            nationality = text(row.nationality, 'Unknown'),
            height = row.height_cm and tonumber(row.height_cm) or nil,
            phone_number = text(row.phone, '-'),
            totalPlayedTime = playtime(payload.playtime),
            accounts = {
                money = text(row.citizen, '-'),
                bank = row.height_cm and ('%d cm'):format(tonumber(row.height_cm)) or '-',
            },
        }
    end
    return out
end

local function slots(payload)
    local list = {}
    for index = 1, math.min(tonumber(payload.maxSlots) or 3, 9) do
        list[index] = { id = index, tebex = false }
    end
    return list
end

---------------------------------------------------------------- lobby: a fixed spot + camera while picking / creating

local lobbyCam = nil
local lobbyClock = false

local camPos = nil   -- camera position after the ground check

-- highest ground under x,y (probes from the sky down), or nil if the map isn't loaded there yet
local function groundAt(x, y, fromZ)
    for _, z in ipairs({ fromZ or 1000.0, 800.0, 600.0, 400.0 }) do
        local ok, gz = GetGroundZFor_3dCoord(x, y, z, false)
        if ok and gz and gz > -100.0 then return gz end
    end
    return nil
end

local function enterLobby()
    local L = Config.Lobby
    if not L or not L.enabled or lobbyCam then return end
    local ped = PlayerPedId()
    local wasFaded = IsScreenFadedOut()
    if not wasFaded then DoScreenFadeOut(0) end

    -- move the (frozen, hidden) player and the streaming focus there, then wait for the map to load
    FreezeEntityPosition(ped, true)
    SetEntityCoordsNoOffset(ped, L.player.x, L.player.y, L.player.z, false, false, false)
    SetEntityHeading(ped, L.player.w)
    SetFocusPosAndVel(L.camera.x, L.camera.y, L.camera.z, 0.0, 0.0, 0.0)
    NewLoadSceneStartSphere(L.camera.x, L.camera.y, L.camera.z, 600.0, 0)
    local deadline = GetGameTimer() + 8000
    repeat
        RequestCollisionAtCoord(L.player.x, L.player.y, L.player.z)
        RequestCollisionAtCoord(L.camera.x, L.camera.y, L.camera.z)
        Wait(50)
    until (HasCollisionLoadedAroundEntity(ped) and IsNewLoadSceneLoaded()) or GetGameTimer() > deadline

    -- never leave the player or the camera inside the hill
    local pg = groundAt(L.player.x, L.player.y, L.player.z + 50.0)
    if pg and math.abs(pg - L.player.z) > 0.5 then
        SetEntityCoordsNoOffset(ped, L.player.x, L.player.y, pg + 1.0, false, false, false)
    end
    local cz = L.camera.z
    local cg = groundAt(L.camera.x, L.camera.y)
    local clearance = L.minCameraHeight or 6.0
    if cg and cz < cg + clearance then cz = cg + clearance end
    camPos = vector3(L.camera.x, L.camera.y, cz)

    lobbyCam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', camPos.x, camPos.y, camPos.z, 0.0, 0.0, 0.0, L.fov or 50.0, false, 2)
    PointCamAtCoord(lobbyCam, L.lookAt.x, L.lookAt.y, L.lookAt.z)
    SetCamActive(lobbyCam, true)
    RenderScriptCams(true, false, 0, true, true)
    if L.hour then
        NetworkOverrideClockTime(math.floor(L.hour), 0, 0)
        lobbyClock = true
    end
    ShutdownLoadingScreen()
    ShutdownLoadingScreenNui()
    DoScreenFadeIn(600)
end

local function leaveLobby(keepCamera)
    if lobbyClock then
        NetworkClearClockTimeOverride()
        lobbyClock = false
    end
    if not lobbyCam then return end
    if not keepCamera then
        RenderScriptCams(false, false, 0, true, true)
        ClearFocus()
        NewLoadSceneStop()
    end
    DestroyCam(lobbyCam, false)
    lobbyCam = nil
end

-- slow drift so the view feels alive
CreateThread(function()
    local t = 0.0
    while true do
        if lobbyCam and Config.Lobby.drift then
            t = t + GetFrameTime() * 0.04
            local L = Config.Lobby
            local c = camPos or L.camera
            SetCamCoord(lobbyCam, c.x + math.sin(t) * 6.0, c.y + math.cos(t * 0.7) * 3.0, c.z)
            PointCamAtCoord(lobbyCam, L.lookAt.x, L.lookAt.y, L.lookAt.z)
            Wait(0)
        else
            Wait(250)
        end
    end
end)

local function show(payload)
    lastPayload = payload
    awaitingCreate = false
    visible = true
    enterLobby()
    SetNuiFocus(true, true)
    nui({
        message = 'SetSteamInfos',
        name = GetPlayerName(PlayerId()),
        profilephoto = 'images/fbrp-logo.png',
        id = GetPlayerServerId(PlayerId()),
    })
    nui({
        message = 'SetChars',
        charData = toScreen(payload),
        Locales = locales(),
        Slots = slots(payload),
        CanDelete = false,
        serverLogo = 'fbrp-logo.png',
        dateFormat = 'en-US',
    })
end

local function hide()
    if not visible then return end
    visible = false
    nui({ message = 'Hide' })
end

-- Birdseye preview ---------------------------------------------------------

local function stopPreview()
    spawnTarget = nil
    if spawnCam then
        RenderScriptCams(false, false, 0, true, true)
        DestroyCam(spawnCam, false)
        spawnCam = nil
    end
    ClearFocus()
    NewLoadSceneStop()
end

local function orbitPosition(target)
    local radius, height = 150.0, 210.0
    return target.x + math.sin(orbit) * radius, target.y + math.cos(orbit) * radius, target.z + height
end

local function previewSpawn(x, y, z)
    local target = vector3(x + 0.0, y + 0.0, z + 0.0)
    spawnTarget = target
    -- Stream the town in around the camera, not around the frozen ped.
    SetFocusPosAndVel(target.x, target.y, target.z, 0.0, 0.0, 0.0)
    NewLoadSceneStartSphere(target.x, target.y, target.z, 450.0, 0)
    local px, py, pz = orbitPosition(target)
    local cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', px, py, pz, 0.0, 0.0, 0.0, 55.0, false, 2)
    PointCamAtCoord(cam, target.x, target.y, target.z)
    if spawnCam then
        SetCamActiveWithInterp(cam, spawnCam, 1600, 1, 1)
        local old = spawnCam
        SetTimeout(1700, function() DestroyCam(old, false) end)
    elseif lobbyCam then
        SetCamActiveWithInterp(cam, lobbyCam, 1600, 1, 1)
        local old = lobbyCam
        lobbyCam = nil
        SetTimeout(1700, function() DestroyCam(old, false) end)
    else
        SetCamActive(cam, true)
        RenderScriptCams(true, true, 1600, true, false)
    end
    spawnCam = cam
end

CreateThread(function()
    while true do
        if spawnCam and spawnTarget then
            orbit = (orbit + GetFrameTime() * 0.05) % (math.pi * 2)
            local px, py, pz = orbitPosition(spawnTarget)
            SetCamCoord(spawnCam, px, py, pz)
            PointCamAtCoord(spawnCam, spawnTarget.x, spawnTarget.y, spawnTarget.z)
            Wait(0)
        else
            Wait(250)
        end
    end
end)

-- Player is in the world (or the screen is being torn down): drop the camera and
-- release the mouse. The cursor is released a few times because other resources
-- have raced a SetNuiFocus(true) in right after spawning.
local function release()
    stopPreview()
    leaveLobby()
    hide()
    SetNuiFocus(false, false)
    CreateThread(function()
        for _ = 1, 6 do
            Wait(500)
            if visible then return end
            local menuOpen = GetResourceState('fbrp_core') == 'started' and exports.fbrp_core:IsMenuOpen()
            if not menuOpen then SetNuiFocus(false, false) end
        end
    end)
end

-- The old fbrp_core selector stands down while this resource is running.
RegisterNetEvent('fbrp:characters:data', function(payload)
    if type(payload) == 'table' then show(payload) end
end)

-- Picking a character moves to the spawn page.
RegisterNetEvent('fbrp:characters:spawns', function(payload)
    if type(payload) ~= 'table' then return end
    visible = true
    SetNuiFocus(true, true)
    nui({ message = 'SetSpawns', data = payload })
end)

-- A refused create/edit: put the reason on the form (notifications can sit behind this screen).
RegisterNetEvent('fbrp:characters:error', function(message)
    awaitingCreate = false
    nui({ message = 'FormError', text = tostring(message or '') })
end)

AddEventHandler('fbrp:characters:placed', release)

AddEventHandler('fbrp:characters:spawnFailed', function()
    nui({ message = 'SpawnFailed' })
end)

AddEventHandler('onClientResourceStop', function(resource)
    if resource == GetCurrentResourceName() then
        stopPreview()
        leaveLobby()
    end
end)

RegisterNUICallback('PreviewSpawn', function(data, cb)
    cb({ ok = true })
    local x, y, z = tonumber(data and data.x), tonumber(data and data.y), tonumber(data and data.z)
    if x and y and z then previewSpawn(x, y, z) end
end)

RegisterNUICallback('ConfirmSpawn', function(data, cb)
    cb({ ok = true })
    if type(data) ~= 'table' then return end
    local ok = exports.fbrp_core:SpawnAt(data)
    if not ok then nui({ message = 'SpawnFailed' }) end
end)

local function gender(value)
    if tostring(value) == '1' then return 'Female' end
    return 'Male'
end

RegisterNUICallback('editChar', function(data, cb)
    cb({ ok = true })
    if type(data) ~= 'table' then return end
    awaitingCreate = true
    TriggerServerEvent('fbrp:characters:update', tonumber(data.id), {
        firstName = data.firstname,
        lastName = data.lastname,
        dateOfBirth = data.dateofbirth,
        gender = gender(data.gender),
        nationality = data.nationality,
        heightCm = data.height,
    })
    SetTimeout(4000, function()
        if awaitingCreate then
            awaitingCreate = false
            TriggerServerEvent('fbrp:characters:request')
        end
    end)
end)

RegisterNUICallback('loaded', function(_, cb)
    nuiReady = true
    cb({ ok = true })
end)

-- The screens ask again when they (re)load; resend whatever we last received.
RegisterNUICallback('loadagain', function(_, cb)
    cb({ ok = true })
    if lastPayload and visible then show(lastPayload) end
end)

RegisterNUICallback('SetAnimations', function(_, cb) cb({ ok = true }) end)
RegisterNUICallback('ChangeCam', function(_, cb) cb({ ok = true }) end)
RegisterNUICallback('checkTebex', function(_, cb) cb({ ok = false }) end)
RegisterNUICallback('DeleteCharacter', function(_, cb) cb({ ok = false }) end)

RegisterNUICallback('Play', function(data, cb)
    cb({ ok = true })
    local id = tonumber(data and data.charData and data.charData.id)
    if id then TriggerServerEvent('fbrp:characters:select', id) end
end)

RegisterNUICallback('createChar', function(data, cb)
    cb({ ok = true })
    if type(data) ~= 'table' then return end
    awaitingCreate = true
    TriggerServerEvent('fbrp:characters:create', {
        firstName = data.firstname,
        lastName = data.lastname,
        dateOfBirth = data.dateofbirth,
        gender = gender(data.gender),
        nationality = data.nationality,
        heightCm = data.height,
        backstory = '',
    })
    -- A refused create (age, height, slots) only sends a notification and no new
    -- list, which would leave the screen blank. Ask for the list again.
    SetTimeout(4000, function()
        if awaitingCreate then
            awaitingCreate = false
            TriggerServerEvent('fbrp:characters:request')
        end
    end)
end)

exports('IsOpen', function() return visible end)
