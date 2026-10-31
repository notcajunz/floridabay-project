JaxttiConfig = {}

JaxttiConfig.ServerName = 'Florida Bay Roleplay'
JaxttiConfig.ShortName = 'FBRP'

JaxttiConfig.Framework = 'auto'

JaxttiConfig.AutoStart = true
JaxttiConfig.Modules = {
    { name = 'jaxtti_designlibrary', enabled = false },
    { name = 'jaxtti_lib',           enabled = true },
    { name = 'jaxtti_textui',        enabled = false },
    { name = 'jaxtti_priorityhud',   enabled = false },
    { name = 'jaxtti_chat',          enabled = false },
    { name = 'jaxtti_api',           enabled = false },
    { name = 'jaxtti_tags',          enabled = false },
    { name = 'jaxtti_hud',           enabled = false },
    { name = 'jaxtti_collision',     enabled = true },
    { name = 'jaxtti_online',        enabled = false },
}

JaxttiConfig.Integrations = {
    designLibrary = 'jaxtti_designlibrary',
    priorityHud   = 'jaxtti_priorityhud',
    postal        = 'jaxtti_priorityhud',
    tags          = 'jaxtti_tags',
    chat          = 'jaxtti_chat',
    sound         = 'xsound',
    database      = 'oxmysql',
}

JaxttiConfig.LegacyNames = false

JaxttiConfig.Debug = false
