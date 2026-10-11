-- ============================================================================
--  Spanish (es) — EXAMPLE translation
-- ============================================================================
--  This file is only a demonstration of how to add a language. To use it, set
--  Config.language = 'es' in config.lua. You can safely delete this file if you
--  do not need Spanish — it changes nothing unless it is selected.
--
--  To make your OWN language: copy locales/en.lua, rename it to your two-letter
--  language code (e.g. 'de.lua'), change Locales['en'] to Locales['de'],
--  translate the text, and set Config.language to that code.
-- ============================================================================

Locales = Locales or {}

Locales['es'] = {
    -- Chat input box
    inputPlaceholder = 'Escribe un mensaje o /comando…',

    -- Footer under the command suggestion list
    suggestBrowse    = 'navegar',
    suggestSend      = 'enviar',

    -- /editchat editor — header & tabs
    editorTitle      = 'Editor de chat',
    tabLayout        = 'Diseño',
    tabTheme         = 'Tema',

    -- /editchat editor — Layout tab
    groupPosition    = 'Posición (cuadrícula)',
    hintPosition     = 'Arrastra la caja para moverla. Arrastra la esquina para redimensionar.',
    labelLeft        = 'Izquierda',
    labelTop         = 'Arriba',
    groupSize        = 'Tamaño (1:1)',
    labelSize        = 'Tamaño',

    -- /editchat editor — Theme tab
    groupColours     = 'Colores',
    labelBackground  = 'Fondo',
    labelText        = 'Texto',
    labelAccent      = 'Acento',
    groupOpacity     = 'Opacidad',
    labelChat        = 'Chat',
    labelTextOpacity = 'Texto',
    groupStyle       = 'Estilo',
    labelBubbles     = 'Burbujas de mensaje',
    hintBubbles      = 'Da a cada mensaje su propio contenedor en lugar de un bloque compartido.',
    groupFont        = 'Fuente',

    -- /editchat editor — action buttons
    btnReset         = 'Restablecer',
    btnCancel        = 'Cancelar',
    btnSave          = 'Guardar',

    -- Layout tab drag box
    ghostTag         = 'Chat',
    ghostResizeTitle = 'Arrastra para redimensionar (mantiene las proporciones)',

    -- System messages
    chatCleared      = 'Chat borrado.',
}
