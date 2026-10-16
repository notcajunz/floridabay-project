from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from .database import Database
from .fbrp_api import FbrpApi, FbrpApiError

# FBRP organization types a department may link to. Gangs and businesses have their own bots.
DEPARTMENT_ORG_TYPES = {"leo", "fire", "government", "other"}


class NotFound(ValueError):
    pass


class DepartmentService:
    def __init__(self, db: Database, api: FbrpApi | None = None):
        self.db = db
        self.api = api or FbrpApi()

    async def department(self, guild_id: int, name: str):
        row = await self.db.fetch_one(
            "SELECT * FROM departments WHERE guild_id=? AND name=?", (guild_id, name.strip())
        )
        if row is None:
            raise NotFound(f"Department `{name}` was not found.")
        return dict(row)

    async def all(self, guild_id: int) -> list[dict[str, Any]]:
        rows = await self.db.fetch_all(
            "SELECT * FROM departments WHERE guild_id=? ORDER BY name COLLATE NOCASE", (guild_id,)
        )
        return [dict(row) for row in rows]

    async def validate_org_link(self, org_ref: str | None) -> dict[str, Any] | None:
        """Resolve an FBRP organization ID or slug; None when no org was given."""
        if org_ref is None or not org_ref.strip():
            return None
        try:
            org = await self.api.org(org_ref.strip())
        except FbrpApiError as error:
            raise ValueError(f"Could not link that FBRP organization: {error}") from None
        if not org.get("active"):
            raise ValueError("That FBRP organization is inactive.")
        if org.get("type") not in DEPARTMENT_ORG_TYPES:
            raise ValueError(
                f"{org.get('name', 'That organization')} is a {org.get('type')} organization, not a department."
            )
        return org

    async def create(self, guild_id: int, name: str, category: str, **values: Any) -> int:
        allowed = {
            "initials", "status", "role_color", "base_role_id", "command_role_id",
            "head_id", "fbrp_org_id", "created_by",
        }
        cols = ["guild_id", "name", "category"]
        params: list[Any] = [guild_id, name.strip(), category]
        for key, value in values.items():
            if key in allowed and value is not None:
                cols.append(key)
                params.append(value)
        marks = ",".join("?" for _ in params)
        return await self.db.execute(
            f"INSERT INTO departments ({','.join(cols)}) VALUES ({marks})", params
        )

    async def setting(self, guild_id: int, key: str, default: str | None = None) -> str | None:
        row = await self.db.fetch_one("SELECT value FROM settings WHERE guild_id=? AND key=?", (guild_id, key))
        return row["value"] if row else default

    async def set_setting(self, guild_id: int, key: str, value: Any) -> None:
        encoded = json.dumps(value) if not isinstance(value, str) else value
        await self.db.execute(
            "INSERT INTO settings(guild_id,key,value) VALUES(?,?,?) "
            "ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value",
            (guild_id, key, encoded),
        )

    async def log(
        self, guild_id: int, category: str, action: str, actor_id: int | None,
        subject: str = "", details: str = "",
    ) -> None:
        await self.db.execute(
            "INSERT INTO activity_log(guild_id,category,action,actor_id,subject,details) VALUES(?,?,?,?,?,?)",
            (guild_id, category, action, actor_id, subject, details),
        )


def future_timestamp(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def parse_color(value: str) -> int:
    clean = value.strip().removeprefix("#").removeprefix("0x")
    try:
        number = int(clean, 16)
    except ValueError:
        raise ValueError("Color must be a hex value such as `#5865F2`.") from None
    if not 0 <= number <= 0xFFFFFF:
        raise ValueError("Color must be a hex value such as `#5865F2`.")
    return number


def parse_message_id(value: str) -> int:
    value = value.strip().rstrip("/")
    final = value.rsplit("/", 1)[-1]
    if not final.isdigit():
        raise ValueError("Message must be a Discord message ID or message link.")
    return int(final)


def duration(seconds: int) -> str:
    return f"{seconds // 3600}h {seconds % 3600 // 60}m"
