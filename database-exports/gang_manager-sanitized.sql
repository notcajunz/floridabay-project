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
INSERT INTO "activity_log" ("id","guild_id","category","action","actor_id","subject","details","created_at") VALUES (1,190168289990565463,'gang','added',195673415868856754,'Shadow Of Death',NULL,'2026-10-14 23:54:50');

DROP TABLE IF EXISTS "businesses";
CREATE TABLE businesses (
    guild_id INTEGER NOT NULL,
    gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    shop_id TEXT NOT NULL,
    sales INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, shop_id)
);

DROP TABLE IF EXISTS "coordinator_liaisons";
CREATE TABLE coordinator_liaisons (
    guild_id INTEGER NOT NULL,
    gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL,
    PRIMARY KEY(guild_id, gang_id, member_id)
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
INSERT INTO "coordinators" ("guild_id","member_id","rank","category","added_at") VALUES (190168289990565463,195673415868856754,'Gang Director','Motorcycle Club','2026-10-13 22:38:51');
INSERT INTO "coordinators" ("guild_id","member_id","rank","category","added_at") VALUES (190168289990565463,831817850279396522,'Trial Gang Coordinator','Motorcycle Club','2026-10-14 23:11:53');
INSERT INTO "coordinators" ("guild_id","member_id","rank","category","added_at") VALUES (190168289990565463,733205726861152740,'Assistant Gang Director','Motorcycle Club','2026-10-27 01:29:21');

DROP TABLE IF EXISTS "gangs";
CREATE TABLE gangs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    initials TEXT,
    gang_type TEXT NOT NULL,
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
INSERT INTO "gangs" ("id","guild_id","name","initials","gang_type","subtype","tier","role_color","emoji","base_role_id","command_role_id","owner_id","fbrp_org_id","external_guild_id","movement","hide_leaderboard","hide_recruitment","cash","dirty_money","drugs","weapons","launder_rate","reward_slots","created_at","updated_at") VALUES (1,190168289990565463,'Shadow Of Death',NULL,'Motorcycle Club',NULL,3,131329,'💀',705486619690692067,581001467083384216,195673415868856754,'4','anon_f603baf4428189101650ec0b','1',0,0,587570,0,10,10,0.15,0,'2026-10-14 23:54:50','2026-10-22 23:21:03');

DROP TABLE IF EXISTS "launder_requests";
CREATE TABLE launder_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    target_gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK(amount > 0),
    rate REAL NOT NULL CHECK(rate BETWEEN 0 AND 1),
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS "ledger";
CREATE TABLE ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    gang_id INTEGER REFERENCES gangs(id) ON DELETE SET NULL,
    asset TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    actor_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "ledger" ("id","guild_id","gang_id","asset","delta","reason","actor_id","created_at") VALUES (1,190168289990565463,1,'cash',100000,'[redacted]',195673415868856754,'2026-10-14 23:57:26');
INSERT INTO "ledger" ("id","guild_id","gang_id","asset","delta","reason","actor_id","created_at") VALUES (2,190168289990565463,1,'weapons',10,'[redacted]',195673415868856754,'2026-10-14 23:57:40');
INSERT INTO "ledger" ("id","guild_id","gang_id","asset","delta","reason","actor_id","created_at") VALUES (3,190168289990565463,1,'drugs',10,'[redacted]',195673415868856754,'2026-10-14 23:57:47');
INSERT INTO "ledger" ("id","guild_id","gang_id","asset","delta","reason","actor_id","created_at") VALUES (4,190168289990565463,1,'cash',100000,'[redacted]',195673415868856754,'2026-10-22 23:18:58');
INSERT INTO "ledger" ("id","guild_id","gang_id","asset","delta","reason","actor_id","created_at") VALUES (5,190168289990565463,1,'cash',500000,'[redacted]',195673415868856754,'2026-10-22 23:21:03');

DROP TABLE IF EXISTS "locations";
CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    postal TEXT NOT NULL,
    location_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, gang_id, postal, location_type)
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
    gang_id INTEGER REFERENCES gangs(id) ON DELETE SET NULL,
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
    gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    other_gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    relation TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, gang_id, other_gang_id)
);

DROP TABLE IF EXISTS "rewards";
CREATE TABLE rewards (
    guild_id INTEGER NOT NULL,
    gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    cash_amount INTEGER NOT NULL DEFAULT 0,
    granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, gang_id, user_id)
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
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'coord_chain_panel','anon_a7e25334e55db5b6991d');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'coord_panel:Cartel','anon_8c7cef8ab86e9a6da9c6');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'coord_panel:Criminal Org','anon_9776acf3d6c89748f9d4');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'coord_panel:Militia','anon_b569218226219f4d2945');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'coord_panel:Motorcycle Club','anon_35d2defefa6504dc90ce');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'coord_panel:Street Gang','anon_0fe2d2be4c85bccdc04d');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'gang_tier_directory','anon_168eee77b56b675a660d');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'panel:hours','[anon_bcb78b9443209b9bce6c]');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'panel:leaderboard','[anon_c674ab2aec333cbc8998]');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'panel:locations','[anon_5038a3daecc5a307f359]');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'panel:shop','[anon_d9605deb266445f4b8d4]');
INSERT INTO "settings" ("guild_id","key","value") VALUES (190168289990565463,'ticket_panel','{"channel": anon_51065360375ae5a5c85b, "message": anon_62748009c64be284b92a}');

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
    gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    target_gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
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
INSERT INTO "ticket_participants" ("ticket_id","user_id","added_by","added_at") VALUES (1,641190284994466476,641190284994466476,1792251632);
INSERT INTO "ticket_participants" ("ticket_id","user_id","added_by","added_at") VALUES (2,297491885037935744,297491885037935744,1792254618);

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
INSERT INTO "tickets" ("id","guild_id","channel_id","control_message_id","author_id","type","subject","status","claimed_by","claimed_at","form_data","created_at","closed_at","closed_by","close_reason","reopen_count") VALUES (1,190168289990565463,386913810961239596,555135481987765904,641190284994466476,'creation','Laurent Crime Family','deleted',NULL,NULL,'[redacted]',1792251632,1792780817,195673415868856754,NULL,0);
INSERT INTO "tickets" ("id","guild_id","channel_id","control_message_id","author_id","type","subject","status","claimed_by","claimed_at","form_data","created_at","closed_at","closed_by","close_reason","reopen_count") VALUES (2,190168289990565463,830795676692726893,585303379189391930,297491885037935744,'creation','Walker Crime Family','deleted',NULL,NULL,'[redacted]',1792254618,1792778854,297491885037935744,NULL,0);

DROP TABLE IF EXISTS "trades";
CREATE TABLE trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
    target_gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
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
    gang_id INTEGER NOT NULL REFERENCES gangs(id) ON DELETE CASCADE,
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
    offending_gang_id INTEGER REFERENCES gangs(id) ON DELETE SET NULL,
    defending_gang_id INTEGER REFERENCES gangs(id) ON DELETE SET NULL,
    stage TEXT NOT NULL,
    outcome TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_guild ON activity_log(guild_id, created_at);
CREATE UNIQUE INDEX idx_gangs_fbrp_org ON gangs(fbrp_org_id) WHERE fbrp_org_id IS NOT NULL AND fbrp_org_id <> '';
CREATE INDEX idx_gangs_guild ON gangs(guild_id);
CREATE INDEX idx_ledger_gang ON ledger(gang_id, created_at);
CREATE INDEX idx_tickets_author ON tickets(guild_id, author_id, status);
CREATE INDEX idx_tickets_channel ON tickets(channel_id);
COMMIT;
PRAGMA foreign_keys=ON;
