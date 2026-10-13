from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from .database import Database

ASSETS = ("cash", "dirty_money", "drugs", "weapons")
TRANSFERABLE_ASSETS = ("cash", "drugs", "weapons")


async def bank_fee_rate(db: Database, guild_id: int) -> float:
    row = await db.fetch_one(
        "SELECT value FROM settings WHERE guild_id=? AND key='bank_fee'", (guild_id,)
    )
    return float(row["value"]) if row else 0.0


def deduct_fee(amount: int, rate: float) -> tuple[int, int]:
    fee = min(amount, round(amount * rate))
    return amount - fee, fee


class NotFound(ValueError):
    pass


class InsufficientFunds(ValueError):
    pass


class GangService:
    def __init__(self, db: Database):
        self.db = db

    async def gang(self, guild_id: int, name: str):
        row = await self.db.fetch_one(
            "SELECT * FROM gangs WHERE guild_id=? AND name=?", (guild_id, name.strip())
        )
        if row is None:
            raise NotFound(f"Gang `{name}` was not found.")
        return row

    async def create(self, guild_id: int, name: str, gang_type: str, **values: Any) -> int:
        allowed = {
            "initials", "subtype", "tier", "role_color", "emoji", "base_role_id",
            "command_role_id", "owner_id", "sal_org_id", "external_guild_id", "movement",
        }
        cols = ["guild_id", "name", "gang_type"]
        params: list[Any] = [guild_id, name.strip(), gang_type.strip()]
        for key, value in values.items():
            if key in allowed and value is not None:
                cols.append(key)
                params.append(value)
        marks = ",".join("?" for _ in params)
        return await self.db.execute(
            f"INSERT INTO gangs ({','.join(cols)}) VALUES ({marks})", params
        )

    async def change_balance(
        self, guild_id: int, gang_name: str, asset: str, delta: int, reason: str, actor_id: int
    ) -> int:
        asset = asset.lower()
        if asset not in ASSETS:
            raise ValueError(f"Asset must be one of: {', '.join(ASSETS)}")
        gang = await self.gang(guild_id, gang_name)
        new_value = int(gang[asset]) + delta
        if new_value < 0:
            raise InsufficientFunds(
                f"{gang['name']} only has {gang[asset]:,} {asset}."
            )
        await self.db.transaction([
            (f"UPDATE gangs SET {asset}=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (new_value, gang["id"])),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)",
             (guild_id, gang["id"], asset, delta, reason, actor_id)),
        ])
        return new_value

    async def transfer(
        self, guild_id: int, source: str, target: str, asset: str, amount: int,
        reason: str, actor_id: int, fee_rate: float = 0.0,
    ) -> None:
        if amount <= 0:
            raise ValueError("Amount must be greater than zero.")
        asset = asset.lower()
        if asset not in TRANSFERABLE_ASSETS:
            raise ValueError(
                f"Transferable asset must be one of: {', '.join(TRANSFERABLE_ASSETS)}"
            )
        source_row = await self.gang(guild_id, source)
        target_row = await self.gang(guild_id, target)
        if source_row[asset] < amount:
            raise InsufficientFunds(f"{source_row['name']} does not have enough {asset}.")
        received, fee = deduct_fee(amount, fee_rate)
        await self.db.transaction([
            (f"UPDATE gangs SET {asset}={asset}-?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (amount, source_row["id"])),
            (f"UPDATE gangs SET {asset}={asset}+?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (received, target_row["id"])),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)",
             (guild_id, source_row["id"], asset, -amount, reason, actor_id)),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)",
             (guild_id, target_row["id"], asset, received, f"{reason} (fee {fee})", actor_id)),
        ])

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
    number = int(clean, 16)
    if not 0 <= number <= 0xFFFFFF:
        raise ValueError("Color must be a hex value such as `#5865F2`.")
    return number


def parse_message_id(value: str) -> int:
    value = value.strip().rstrip("/")
    final = value.rsplit("/", 1)[-1]
    if not final.isdigit():
        raise ValueError("Message must be a Discord message ID or message link.")
    return int(final)
