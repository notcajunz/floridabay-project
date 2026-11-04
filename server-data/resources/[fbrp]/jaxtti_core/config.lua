JaxttiConfig = {}

JaxttiConfig.ServerName = 'Florida Bay Roleplay'
JaxttiConfig.ShortName = 'FBRP'

JaxttiConfig.Framework = 'auto'

JaxttiConfig.AutoStart = true
JaxttiConfig.Modules = {
    { name = 'jaxtti_designlibrary', enabled = true },
    { name = 'jaxtti_lib',           enabled = true },
    { name = 'jaxtti_textui',        enabled = true },
    { name = 'jaxtti_priorityhud',   enabled = true },
    { name = 'jaxtti_chat',          enabled = true },
    { name = 'jaxtti_api',           enabled = true },
    { name = 'jaxtti_tags',          enabled = true },
    { name = 'jaxtti_hud',           enabled = true },
    { name = 'jaxtti_collision',     enabled = true },
    { name = 'jaxtti_online',        enabled = true },
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
