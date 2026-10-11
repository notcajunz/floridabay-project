-- ============================================================================
--  English (en) — reference / fallback locale for the s4_chat UI
-- ============================================================================
--  This file translates the chat interface. It is plain text and ships with the
--  built resource, so you can edit it WITHOUT the UI source and WITHOUT running
--  any build. See locales/README.md for how to add your own language.
--
--  'en' is the fallback: any key you leave out of another language automatically
--  falls back to the English text below, so the UI can never end up blank.
--
--  Keep the keys (left side) exactly as they are — only translate the text in
--  the quotes on the right.
-- ============================================================================

Locales = Locales or {}

Locales['en'] = {
    -- Chat input box
    inputPlaceholder = 'Type a message or /command…',

    -- Footer under the command suggestion list
    suggestBrowse    = 'browse',
    suggestSend      = 'send',

    -- /editchat editor — header & tabs
    editorTitle      = 'Chat Editor',
    tabLayout        = 'Layout',
    tabTheme         = 'Theme',

    -- /editchat editor — Layout tab
    groupPosition    = 'Position (grid)',
    hintPosition     = 'Drag the box to move it. Drag the corner square to resize.',
    labelLeft        = 'Left',
    labelTop         = 'Top',
    groupSize        = 'Size (1:1)',
    labelSize        = 'Size',

    -- /editchat editor — Theme tab
    groupColours     = 'Colours',
    labelBackground  = 'Background',
    labelText        = 'Text',
    labelAccent      = 'Accent',
    groupOpacity     = 'Opacity',
    labelChat        = 'Chat',
    labelTextOpacity = 'Text',
    groupStyle       = 'Style',
    labelBubbles     = 'Message bubbles',
    hintBubbles      = 'Give every message its own container instead of one shared block.',
    groupFont        = 'Font',

    -- /editchat editor — action buttons
    btnReset         = 'Reset',
    btnCancel        = 'Cancel',
    btnSave          = 'Save',

    -- Layout tab drag box
    ghostTag         = 'Chat',
    ghostResizeTitle = 'Drag to resize (keeps proportions)',

    -- System messages
    chatCleared      = 'Chat cleared.',
}
