Config = {}

-- Emoji shortcodes in messages, e.g. :) becomes an emoji
Config.emoji = true

-- Show the player's server ID next to their name, e.g. #42 steamname
Config.showPlayerId = true

-- UI language. Needs a matching locales/*.lua file.
-- Missing lines fall back to English.
Config.language = 'en'

-- Max characters per message
Config.maxlengthmessage = 999

-- Out of character chat.
-- 'command' is the OOC command and also what a message typed without a /
-- is sent as, so typing "hello" runs /ooc hello.
-- Turning this off disables /ooc and stops plain messages being sent at all.
Config.ooc = {
    enabled = true,
    command = 'ooc',
}

-- Throttles players who send messages too quickly
Config.antiSpam = {
    enabled = true,
    burstMax = 5, -- messages allowed within burstWindow
    burstWindow = 1000, -- ms
    burstCooldown = 5000, -- ms the player must wait after hitting the limit
}

Config.ui = {
    fadeTimeout = 5000, -- ms before the chat fades out after the last message
}

-- Personal customisation editor. Each player can change the chat's colours,
-- position, opacity, message style, font and size. Saved per player and
-- re-applied on join.
Config.editchat = {
    command = 'editchat',
    key = '', -- optional keybind, e.g. 'F7'
}

-- Floating text above a player's head when they use a command listed below
Config.emote3d = {
    enabled  = true,
    commands = {
        ['me'] = true,
        ['do'] = true,
    },
    duration = 8000,  -- ms the text stays visible
    range = 20.0,  -- metres others can see it from
    maxChars = 100,   -- longer messages get cut off
    updateMs = 150,   -- how often the text position follows the player
}

-- Commands that s4_chat registers, routes and displays in chat.
--
-- cmd     : command name without /
-- enabled : false skips the command entirely
-- badge   : label shown on the message in chat
-- type    : 'proximity' = nearby players only | 'global' = everyone
-- range   : radius in metres, proximity only
-- format  : 'name' = show the player's name before the message | 'plain' = message only
-- help    : shown in the autocomplete hint
Config.commands = {
    { cmd = 'ooc', enabled = true, badge = 'OOC', type = 'proximity', range = 20.0, format = 'name',  help = 'Out of character message.' },
    { cmd = 'me',  enabled = true, badge = 'ME',  type = 'proximity', range = 20.0, format = 'plain', help = 'Show an action. (Nearby players)' },
    { cmd = 'do',  enabled = true, badge = 'DO',  type = 'proximity', range = 20.0, format = 'plain', help = 'Describe the environment or a situation. (Nearby players)' },
}

-- Clears the chat only for the player who runs it
Config.clearChat = {
    enabled = true,
    command = 'clear',
    help = 'Clear your own chat history.',
    notify  = true, -- show a "Chat cleared." message afterwards
}

-- What Enter does while the autocomplete list is open.
--
-- 'smart'  : sends the message, unless the command name is still incomplete
--            (/o -> /ooc). Tab always completes, arrows pick from the list.
-- 'always' : always completes the highlighted suggestion first
-- 'off'    : always sends, completion is Tab only
Config.autocomplete = {
    enterComplete = 'smart',
}

-- Messages posted to everyone on a timer
Config.announcements = {
    enabled = true,
    interval = 15, -- minutes between messages
    random = true, -- false goes through the list in order
    badge = 'Automatic Message',
    messages = {
        "Welcome to our server! If you are visiting for the first time, make sure to read the rules. It will help you become part of the community faster.",
        "Encountered an issue or noticed a rule violation? Use /report [message] and the administration team will assist you as soon as possible.",
        "Remember to respect other players both in-game and outside of the game. A friendly and respectful atmosphere creates a better experience for everyone.",
        "If you enjoy our server, invite your friends to join! The more active players we have, the more interesting and lively the world becomes.",
        "Want a better roleplay experience? Use /me and /do commands to describe your actions, emotions, and environmental details.",
        "Remember that OOC information should not be used in IC situations. Separating your character's knowledge from your own is an important part of good roleplay.",
        "If you have questions about server systems or rules, don't hesitate to ask the community or administration - there will always be someone willing to help.",
        "Every player contributes to the server's atmosphere. By creating interesting stories and respecting others, you help the entire community grow.",
    },
}