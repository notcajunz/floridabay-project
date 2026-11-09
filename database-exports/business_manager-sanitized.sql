-- Florida Bay SQLite sanitized logical export
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

DROP TABLE IF EXISTS "activity_log";
CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER,
    subject TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (1,267730909943787670,'business','added',476826378291999427,'Palm Beach Hotrods',NULL,'2026-10-22 01:46:51');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (2,267730909943787670,'voice','lineadd',476826378291999427,'anon_2fc935640901d95f33d4',NULL,'2026-10-22 01:47:29');
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (3,267730909943787670,'business','updated',476826378291999427,'Palm Beach Hotrods',NULL,'2026-10-22 01:55:57');

DROP TABLE IF EXISTS "businesses";
CREATE TABLE businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    initials TEXT,
    business_type TEXT NOT NULL,
    subtype TEXT,
    tier INTEGER NOT NULL DEFAULT 1 CHECK(tier >= 0),
    role_color INTEGER NOT NULL DEFAULT 0,
    emoji TEXT,
    base_role_id INTEGER,
    command_role_id INTEGER,
    owner_id INTEGER,
    fbrp_org_id TEXT,
    external_guild_id TEXT,
    movement TEXT,
    hide_leaderboard INTEGER NOT NULL DEFAULT 0,
    hide_recruitment INTEGER NOT NULL DEFAULT 0,
    cash INTEGER NOT NULL DEFAULT 0 CHECK(cash >= 0),
    dirty_money INTEGER NOT NULL DEFAULT 0 CHECK(dirty_money >= 0),
    drugs INTEGER NOT NULL DEFAULT 0 CHECK(drugs >= 0),
    weapons INTEGER NOT NULL DEFAULT 0 CHECK(weapons >= 0),
    launder_rate REAL NOT NULL DEFAULT 0.15 CHECK(launder_rate BETWEEN 0 AND 1),
    reward_slots INTEGER NOT NULL DEFAULT 0 CHECK(reward_slots >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, name)
);
INSERT INTO "businesses" ("id","guild_id","name","initials","business_type","subtype","tier","role_color","emoji","base_role_id","command_role_id","owner_id","fbrp_org_id","external_guild_id","movement","hide_leaderboard","hide_recruitment","cash","dirty_money","drugs","weapons","launder_rate","reward_slots","created_at","updated_at") VALUES (1,267730909943787670,'Palm Beach Hotrods',NULL,'Car Clubs & Automotive','Parties',3,12461349,'🏎️',762352248016141358,269105979231855199,476826378291999427,'6','anon_feb559ddcbf46145882f92e3','1',0,0,0,0,0,0,0.15,0,'2026-10-22 01:46:51','2026-10-22 01:55:57');

DROP TABLE IF EXISTS "coordinator_liaisons";
CREATE TABLE coordinator_liaisons (
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL,
    PRIMARY KEY(guild_id, business_id, member_id)
);

DROP TABLE IF EXISTS "coordinators";
CREATE TABLE coordinators (
    guild_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    rank TEXT NOT NULL,
    category TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, member_id, category)
);
INSERT INTO "coordinators" ("guild_id","member_id","rank","category","added_at") VALUES (267730909943787670,195673415868856754,'Head of Businesses','Miscellaneous','2026-10-24 20:17:34');
INSERT INTO "coordinators" ("guild_id","member_id","rank","category","added_at") VALUES (267730909943787670,195673415868856754,'Head of Businesses','Security & Protection','2026-10-24 20:17:23');
INSERT INTO "coordinators" ("guild_id","member_id","rank","category","added_at") VALUES (267730909943787670,171459291854590200,'Assistant Business Director','Security & Protection','2026-10-18 04:16:43');

DROP TABLE IF EXISTS "launder_requests";
CREATE TABLE launder_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    target_business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK(amount > 0),
    rate REAL NOT NULL CHECK(rate BETWEEN 0 AND 1),
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS "ledger";
CREATE TABLE ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    asset TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    actor_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS "locations";
CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    postal TEXT NOT NULL,
    location_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, business_id, postal, location_type)
);

DROP TABLE IF EXISTS "permissions";
CREATE TABLE permissions (
    guild_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    permission TEXT NOT NULL,
    allowed INTEGER NOT NULL,
    PRIMARY KEY(guild_id, target_type, target_id, permission)
);

DROP TABLE IF EXISTS "protected_roles";
CREATE TABLE protected_roles (
    guild_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY(guild_id, role_id)
);

DROP TABLE IF EXISTS "punishments";
CREATE TABLE punishments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    punishment TEXT NOT NULL,
    notes TEXT,
    actor_id INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    edit_reason TEXT,
    duration_days INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS "relations";
CREATE TABLE relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    other_business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    relation TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, business_id, other_business_id)
);

DROP TABLE IF EXISTS "rewards";
CREATE TABLE rewards (
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    cash_amount INTEGER NOT NULL DEFAULT 0,
    granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, business_id, user_id)
);

DROP TABLE IF EXISTS "role_managers";
CREATE TABLE role_managers (
    guild_id INTEGER NOT NULL,
    managed_role_id INTEGER NOT NULL,
    manager_type TEXT NOT NULL CHECK(manager_type IN ('user', 'role')),
    manager_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, managed_role_id, manager_type, manager_id)
);

DROP TABLE IF EXISTS "settings";
CREATE TABLE settings (
    guild_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY(guild_id, key)
);
INSERT INTO "settings" ("guild_id","key","value") VALUES (267730909943787670,'business_tier_directory','anon_138043b9a4685e0a8483');
INSERT INTO "settings" ("guild_id","key","value") VALUES (267730909943787670,'coord_chain_panel','anon_cb0bcaa062882b709428');
INSERT INTO "settings" ("guild_id","key","value") VALUES (267730909943787670,'coord_panel:Car Clubs & Automotive','anon_a515a61b9e78a634777a');
INSERT INTO "settings" ("guild_id","key","value") VALUES (267730909943787670,'coord_panel:Miscellaneous','anon_8db50207e3e621289cb7');
INSERT INTO "settings" ("guild_id","key","value") VALUES (267730909943787670,'coord_panel:Security & Protection','anon_974d8bf76744ccbf0558');
INSERT INTO "settings" ("guild_id","key","value") VALUES (267730909943787670,'coord_panel:Trucking & Contracting','anon_b429bdabd69d9fccdab6');
INSERT INTO "settings" ("guild_id","key","value") VALUES (267730909943787670,'panel:hours','[anon_39a67377f8c8c0af526e]');
INSERT INTO "settings" ("guild_id","key","value") VALUES (267730909943787670,'ticket_panel','{"channel": anon_7dba3a10e0b2b2c40057, "message": anon_752085870b2f07d22a12}');

DROP TABLE IF EXISTS "shop_items";
CREATE TABLE shop_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    price INTEGER NOT NULL CHECK(price >= 0),
    quantity INTEGER NOT NULL CHECK(quantity >= 0),
    description TEXT,
    unit TEXT NOT NULL,
    UNIQUE(guild_id, name)
);

DROP TABLE IF EXISTS "taxes";
CREATE TABLE taxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    target_business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    rate REAL NOT NULL CHECK(rate BETWEEN 0 AND 1),
    status TEXT NOT NULL,
    notes TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS "temp_roles";
CREATE TABLE temp_roles (
    guild_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY(guild_id, member_id, role_id)
);

DROP TABLE IF EXISTS "ticket_participants";
CREATE TABLE ticket_participants (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        added_by INTEGER,
        added_at INTEGER NOT NULL,
        PRIMARY KEY(ticket_id, user_id)
    );
INSERT INTO "ticket_participants" ("ticket_id","user_id","added_by","added_at") VALUES (1,641190284994466476,641190284994466476,1792286384);

DROP TABLE IF EXISTS "tickets";
CREATE TABLE tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id INTEGER NOT NULL,
        channel_id INTEGER,
        control_message_id INTEGER,
        author_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        claimed_by INTEGER,
        claimed_at INTEGER,
        form_data TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        closed_at INTEGER,
        closed_by INTEGER,
        close_reason TEXT,
        reopen_count INTEGER NOT NULL DEFAULT 0
    );
INSERT INTO "tickets" ("id","guild_id","channel_id","control_message_id","author_id","type","subject","status","claimed_by","claimed_at","form_data","created_at","closed_at","closed_by","close_reason","reopen_count") VALUES (1,267730909943787670,891040123287184877,126015827001938566,641190284994466476,'creation','test','deleted',641190284994466476,1792286406,'[redacted]',1792286384,1792286417,641190284994466476,NULL,0);

DROP TABLE IF EXISTS "trades";
CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    target_business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    offer_asset TEXT NOT NULL,
    offer_amount INTEGER NOT NULL,
    request_asset TEXT,
    request_amount INTEGER,
    notes TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS "turf_investments";
CREATE TABLE turf_investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    war_id INTEGER NOT NULL REFERENCES turf_wars(id) ON DELETE CASCADE,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    actor_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS "turf_wars";
CREATE TABLE turf_wars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    location TEXT,
    offending_business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    defending_business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    stage TEXT NOT NULL,
    outcome TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_guild ON activity_log(guild_id, created_at);
CREATE UNIQUE INDEX idx_businesses_fbrp_org ON businesses(fbrp_org_id) WHERE fbrp_org_id IS NOT NULL AND fbrp_org_id <> '';
CREATE INDEX idx_businesses_guild ON businesses(guild_id);
CREATE INDEX idx_ledger_business ON ledger(business_id, created_at);
CREATE INDEX idx_tickets_author ON tickets(guild_id, author_id, status);
CREATE INDEX idx_tickets_channel ON tickets(channel_id);
COMMIT;
PRAGMA foreign_keys=ON;
