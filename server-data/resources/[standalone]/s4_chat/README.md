A custom FiveM chat resource. This document explains how to send messages and create commands from other scripts using s4_chat exports.

---

## Table of Contents
- [Sending Messages](#sending-messages)
- [Autocomplete Suggestions](#autocomplete-suggestions)
- [Registering a Command](#registering-a-command)
- [Full Command Example - Server Logic](#full-command-example--server-logic)
- [Full Command Example - Client Only](#full-command-example--client-only)
- [Parameter Reference](#parameter-reference)

---

## Sending Messages

### From the server - to everyone
```lua
exports['s4_chat']:SendMessage(-1, {
    badge   = 'INFO',
    message = 'Hello everyone!',
    color   = '#4ec98f',
    icon    = 'bx-bell',
})
```

### From the server - to one player
```lua
exports['s4_chat']:SendMessage(source, {
    badge   = 'INFO',
    message = 'Hello! Only you can see this.',
    color   = '#4ec98f',
    icon    = 'bx-bell',
})
```

### From the client - local only (only you see it)
```lua
-- plain, no styling
exports['s4_chat']:addMessage('Something happened!')

-- styled with badge and color
exports['s4_chat']:SendMessage({
    badge   = 'INFO',
    message = 'Something happened!',
    color   = '#4ec98f',
    icon    = 'bx-bell',
})
```

> **Note:** Client-side `SendMessage` is always local. It never sends to other players.

---

## Autocomplete Suggestions

Adds a hint that appears in the chat input when a player starts typing a command. This is **cosmetic only** - it does not make the command work on its own.

```lua
exports['s4_chat']:addSuggestion('/mycommand', 'Short description here', {
    { name = 'player', help = 'Target player ID' },
    { name = 'reason', help = 'Reason'           },
})
```

---

## Registering a Command

To register a command that s4_chat handles and broadcasts, call this on the **server**:

```lua
exports['s4_chat']:RegisterCommand({
    cmd    = 'mycommand',    -- the command name, without /
    badge  = 'INFO',         -- the label shown on the message in chat
    type   = 'global',       -- who sees the message (see Parameter Reference)
    range  = 20.0,           -- radius in metres, only used when type = 'proximity'
    format = 'plain',        -- whether to show the player name (see Parameter Reference)
    help   = 'My command.',  -- description shown in the autocomplete hint
    color  = '#4ec98f',      -- badge accent color in hex
    icon   = 'bx-bolt',      -- icon from https://boxicons.com
})
```

> **Important:** This only registers the routing inside s4_chat. The player still needs a client-side `RegisterCommand` call so the game accepts the input. See the full example below.

---

## Full Command Example - Server Logic

Use this pattern when the command needs a **job check**, **database call**, or anything that must run on the server.

**`server/main.lua`**
```lua
-- Step 1: tell s4_chat this command exists and how to display it
exports['s4_chat']:RegisterCommand({
    cmd    = 'radio',
    badge  = 'RADIO',
    type   = 'global',
    format = 'name',         -- 'name' shows the player's name before the message
    help   = 'Send a radio message.',
    color  = '#46c5ff',
    icon   = 'bx-radio',
})

-- Step 2: handle the actual logic when a player uses /radio
RegisterNetEvent('s4_chat:runCommand', function(cmd, rawCommand)
    if cmd ~= 'radio' then return end

    local src    = source
    local msg    = rawCommand:gsub('^/?radio%s*', '')

    if msg == '' then
        exports['s4_chat']:SendMessage(src, {
            badge   = 'RADIO',
            message = 'Usage: /radio [message]',
            color   = '#ffb152',
            icon    = 'bx-info-circle',
        })
        return
    end

    -- example job check (ESX)
    local xPlayer = ESX.GetPlayerFromId(src)
    if xPlayer.getJob().name ~= 'police' then
        exports['s4_chat']:SendMessage(src, {
            badge   = 'RADIO',
            message = 'You do not have access to this command.',
            color   = '#ff5d77',
            icon    = 'bx-shield-x',
        })
        return
    end

    -- broadcast to everyone
    exports['s4_chat']:SendMessage(-1, {
        badge   = 'RADIO',
        message = ('[%s]: %s'):format(GetPlayerName(src), msg),
        color   = '#46c5ff',
        icon    = 'bx-radio',
    })
end)
```

**`client/main.lua`**
```lua
-- Step 3: register so the game accepts /radio as a valid input
-- without this the game will say "command not found"
RegisterCommand('radio', function(_, _, rawCommand)
    TriggerServerEvent('s4_chat:runCommand', 'radio', rawCommand)
end, false)

-- Step 4: add the autocomplete hint
exports['s4_chat']:addSuggestion('/radio', 'Send a radio message.', {
    { name = 'message', help = 'What you want to say' },
})
```

---

## Full Command Example - Client Only

Use this pattern when the command **only affects the local player** and nothing needs to happen on the server.

**`client/main.lua`**
```lua
-- Step 1: register the command and handle everything here
RegisterCommand('status', function(_, args)
    local msg = table.concat(args, ' ')

    if msg == '' then
        exports['s4_chat']:SendMessage({
            badge   = 'STATUS',
            message = 'Usage: /status [message]',
            color   = '#ffb152',
            icon    = 'bx-info-circle',
        })
        return
    end

    exports['s4_chat']:SendMessage({
        badge   = 'STATUS',
        message = msg,
        color   = '#8a7cff',
        icon    = 'bx-user',
    })
end, false)

-- Step 2: add the autocomplete hint
exports['s4_chat']:addSuggestion('/status', 'Set your local status.', {
    { name = 'message', help = 'Your status message' },
})
```

---

> **Translations:** the chat UI can be translated into any language - see `locales folder`.

## Parameter Reference

### `SendMessage` fields
| Field | Type | Description |
|---|---|---|
| `badge` | string | Label shown on the message, e.g. `'INFO'`, `'RADIO'` |
| `message` | string | The text content of the message |
| `color` | string | Hex color for the badge accent, e.g. `'#4ec98f'` |
| `icon` | string | Boxicons class name - browse at https://boxicons.com |

### `RegisterCommand` fields
| Field | Type | Options | Description |
|---|---|---|---|
| `cmd` | string | any | Command name without `/` |
| `badge` | string | any | Label shown on the message |
| `type` | string | `'global'` `'proximity'` | `global` = everyone sees it, `proximity` = only nearby players |
| `range` | number | any | Radius in metres, only applies when `type = 'proximity'` |
| `format` | string | `'plain'` `'name'` | `plain` = message only, `name` = player name shown before message |
| `help` | string | any | Description shown in the autocomplete hint |
| `color` | string | hex | Badge accent color |
| `icon` | string | boxicons | Icon class from https://boxicons.com |