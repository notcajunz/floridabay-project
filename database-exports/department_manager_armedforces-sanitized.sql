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

DROP TABLE IF EXISTS "departments";
CREATE TABLE departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    initials TEXT,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'In Development',
    role_color INTEGER NOT NULL DEFAULT 0,
    base_role_id INTEGER,
    command_role_id INTEGER,
    head_id INTEGER,
    fbrp_org_id TEXT,
    invite TEXT,
    hide_leaderboard INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, external_guild_id TEXT,
    UNIQUE(guild_id, name)
);

DROP TABLE IF EXISTS "dept_role_perms";
CREATE TABLE dept_role_perms (
    guild_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    subject_type TEXT NOT NULL CHECK(subject_type IN ('user', 'role')),
    subject_id INTEGER NOT NULL,
    allowed INTEGER NOT NULL,
    set_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, role_id, subject_type, subject_id)
);

DROP TABLE IF EXISTS "dept_role_requests";
CREATE TABLE dept_role_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    channel_id INTEGER,
    message_id INTEGER,
    reviewer_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT
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
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    punishment TEXT NOT NULL,
    notes TEXT,
    actor_id INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    edit_reason TEXT,
    duration_days INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
INSERT INTO "settings" ("guild_id","key","value") VALUES (858169441001683286,'panel:chain','[anon_0a4acc7b44faa7e421f8]');
INSERT INTO "settings" ("guild_id","key","value") VALUES (858169441001683286,'panel:hours','[anon_c233a4f83f6959e93bc7]');
INSERT INTO "settings" ("guild_id","key","value") VALUES (858169441001683286,'ticket_panel','{"channel": anon_77d1dd87c7c098cdc805, "message": anon_44c0782a254ac8bd1f8c}');

DROP TABLE IF EXISTS "stickies";
CREATE TABLE stickies (
    guild_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    embed TEXT NOT NULL,
    message_id INTEGER,
    created_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, channel_id)
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

CREATE INDEX idx_activity_guild ON activity_log(guild_id, created_at);
CREATE UNIQUE INDEX idx_departments_external_guild ON departments(external_guild_id) WHERE external_guild_id IS NOT NULL AND external_guild_id <> '';
CREATE UNIQUE INDEX idx_departments_fbrp_org ON departments(fbrp_org_id)
    WHERE fbrp_org_id IS NOT NULL AND fbrp_org_id <> '';
CREATE INDEX idx_departments_guild ON departments(guild_id);
CREATE INDEX idx_role_requests_pending ON dept_role_requests(guild_id, member_id, role_id, status);
CREATE INDEX idx_tickets_author ON tickets(guild_id, author_id, status);
CREATE INDEX idx_tickets_channel ON tickets(channel_id);
COMMIT;
PRAGMA foreign_keys=ON;
