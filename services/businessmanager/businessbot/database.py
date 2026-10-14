from __future__ import annotations

import asyncio
import sqlite3
from collections.abc import Iterable
from pathlib import Path
from typing import Any


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS businesses (
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
    reward_slots INTEGER NOT NULL DEFAULT 0 CHECK(reward_slots >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, name)
);

CREATE TABLE IF NOT EXISTS settings (
    guild_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY(guild_id, key)
);

CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    postal TEXT NOT NULL,
    location_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, business_id, postal, location_type)
);

CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    asset TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    actor_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS punishments (
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

CREATE TABLE IF NOT EXISTS permissions (
    guild_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    permission TEXT NOT NULL,
    allowed INTEGER NOT NULL,
    PRIMARY KEY(guild_id, target_type, target_id, permission)
);

CREATE TABLE IF NOT EXISTS protected_roles (
    guild_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY(guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_managers (
    guild_id INTEGER NOT NULL,
    managed_role_id INTEGER NOT NULL,
    manager_type TEXT NOT NULL CHECK(manager_type IN ('user', 'role')),
    manager_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, managed_role_id, manager_type, manager_id)
);

CREATE TABLE IF NOT EXISTS coordinator_liaisons (
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL,
    PRIMARY KEY(guild_id, business_id, member_id)
);

CREATE TABLE IF NOT EXISTS coordinators (
    guild_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    rank TEXT NOT NULL,
    category TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, member_id, category)
);

CREATE TABLE IF NOT EXISTS rewards (
    guild_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    cash_amount INTEGER NOT NULL DEFAULT 0,
    granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(guild_id, business_id, user_id)
);

CREATE TABLE IF NOT EXISTS temp_roles (
    guild_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY(guild_id, member_id, role_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER,
    subject TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_businesses_guild ON businesses(guild_id);
CREATE INDEX IF NOT EXISTS idx_ledger_business ON ledger(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_guild ON activity_log(guild_id, created_at);
"""


class Database:
    """Small async facade over SQLite with serialized writes."""

    def __init__(self, path: Path):
        self.path = path
        self._conn: sqlite3.Connection | None = None
        self._lock = asyncio.Lock()

    async def connect(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        await asyncio.to_thread(self._conn.executescript, SCHEMA)
        columns = await asyncio.to_thread(
            lambda: {row[1] for row in self._conn.execute("PRAGMA table_info(businesses)").fetchall()}
        )
        if "sal_org_id" in columns and "fbrp_org_id" not in columns:
            await asyncio.to_thread(
                self._conn.execute,
                "ALTER TABLE businesses RENAME COLUMN sal_org_id TO fbrp_org_id",
            )
        await asyncio.to_thread(
            self._conn.execute,
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_fbrp_org ON businesses(fbrp_org_id) "
            "WHERE fbrp_org_id IS NOT NULL AND fbrp_org_id <> ''",
        )
        reward_columns = await asyncio.to_thread(
            lambda: {row[1] for row in self._conn.execute("PRAGMA table_info(rewards)").fetchall()}
        )
        if "cash_amount" not in reward_columns:
            await asyncio.to_thread(
                self._conn.execute,
                "ALTER TABLE rewards ADD COLUMN cash_amount INTEGER NOT NULL DEFAULT 0",
            )
        punishment_columns = await asyncio.to_thread(
            lambda: {row[1] for row in self._conn.execute("PRAGMA table_info(punishments)").fetchall()}
        )
        if "duration_days" not in punishment_columns:
            await asyncio.to_thread(
                self._conn.execute,
                "ALTER TABLE punishments ADD COLUMN duration_days INTEGER",
            )
        await asyncio.to_thread(self._conn.commit)

    async def close(self) -> None:
        if self._conn is not None:
            await asyncio.to_thread(self._conn.close)
            self._conn = None

    @property
    def conn(self) -> sqlite3.Connection:
        if self._conn is None:
            raise RuntimeError("Database is not connected")
        return self._conn

    async def execute(self, sql: str, params: Iterable[Any] = ()) -> int:
        async with self._lock:
            cursor = await asyncio.to_thread(self.conn.execute, sql, tuple(params))
            await asyncio.to_thread(self.conn.commit)
            return cursor.lastrowid

    async def execute_count(self, sql: str, params: Iterable[Any] = ()) -> int:
        async with self._lock:
            cursor = await asyncio.to_thread(self.conn.execute, sql, tuple(params))
            await asyncio.to_thread(self.conn.commit)
            return cursor.rowcount

    async def execute_many(self, sql: str, rows: Iterable[Iterable[Any]]) -> None:
        materialized = [tuple(row) for row in rows]
        async with self._lock:
            await asyncio.to_thread(self.conn.executemany, sql, materialized)
            await asyncio.to_thread(self.conn.commit)

    async def fetch_one(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
        async with self._lock:
            cursor = await asyncio.to_thread(self.conn.execute, sql, tuple(params))
            return await asyncio.to_thread(cursor.fetchone)

    async def fetch_all(self, sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
        async with self._lock:
            cursor = await asyncio.to_thread(self.conn.execute, sql, tuple(params))
            return await asyncio.to_thread(cursor.fetchall)

    async def transaction(self, statements: Iterable[tuple[str, Iterable[Any]]]) -> None:
        async with self._lock:
            try:
                await asyncio.to_thread(self.conn.execute, "BEGIN IMMEDIATE")
                for sql, params in statements:
                    await asyncio.to_thread(self.conn.execute, sql, tuple(params))
                await asyncio.to_thread(self.conn.commit)
            except Exception:
                await asyncio.to_thread(self.conn.rollback)
                raise
