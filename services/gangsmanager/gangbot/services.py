from __future__ import annotations

import json
import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from .database import Database
from .fbrp_api import FbrpApi, FbrpApiError

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
    def __init__(self, db: Database, api: FbrpApi | None = None, *, allow_local_cash: bool = False):
        self.db = db
        self.api = api or FbrpApi()
        self.allow_local_cash = allow_local_cash

    async def gang(self, guild_id: int, name: str):
        row = await self.db.fetch_one(
            "SELECT * FROM gangs WHERE guild_id=? AND name=?", (guild_id, name.strip())
        )
        if row is None:
            raise NotFound(f"Gang `{name}` was not found.")
        return await self.live_cash(row)

    async def live_cash(self, row) -> dict[str, Any]:
        result = dict(row)
        if not result.get("fbrp_org_id"):
            return result
        try:
            result["cash"] = int((await self.api.wallet(result["fbrp_org_id"]))["balance"])
        except (FbrpApiError, KeyError, TypeError, ValueError) as error:
            raise ValueError(f"Could not read {result['name']}'s live organization wallet: {error}") from None
        return result

    async def live_cash_rows(self, rows) -> list[dict[str, Any]]:
        materialized = [row for row in rows if row["fbrp_org_id"] or self.allow_local_cash]
        return list(await asyncio.gather(*(self.live_cash(row) for row in materialized)))

    async def validate_org_link(self, org_ref: str | None) -> str:
        if not org_ref:
            raise ValueError("An FBRP organization is required; gang cash uses its live organization wallet.")
        try:
            org = await self.api.org(org_ref)
        except FbrpApiError as error:
            raise ValueError(f"Could not link that FBRP organization: {error}") from None
        if not org.get("active"):
            raise ValueError("That FBRP organization is inactive.")
        if org.get("type") != "gang":
            raise ValueError(f"{org.get('name', 'That organization')} is not a gang organization.")
        return str(org["id"])

    async def create(self, guild_id: int, name: str, gang_type: str, **values: Any) -> int:
        allowed = {
            "initials", "subtype", "tier", "role_color", "emoji", "base_role_id",
            "command_role_id", "owner_id", "fbrp_org_id", "external_guild_id", "movement",
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
        if asset == "cash":
            if gang.get("fbrp_org_id"):
                balances = await self.change_cash_batch([(gang, delta, reason)], actor_id)
                return balances[gang["id"]]
            if not self.allow_local_cash:
                raise ValueError(f"{gang['name']} has no FBRP organization linked, so it has no cash wallet.")
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

    async def change_cash_batch(
        self,
        entries: list[tuple[Any, int, str]],
        actor_id: int,
        request_id: str | None = None,
    ) -> dict[int, int]:
        """Atomically change linked org wallets; SQLite cash is only a compatibility cache."""
        if not entries:
            return {}
        rows = [(dict(row), int(delta), reason) for row, delta, reason in entries if delta]
        if not rows:
            return {int(dict(row)["id"]): int(dict(row)["cash"]) for row, _, _ in entries}
        linked = [bool(row.get("fbrp_org_id")) for row, _, _ in rows]
        if not self.allow_local_cash and not all(linked):
            raise ValueError("Every gang in a cash transaction must be linked to an FBRP organization.")
        if any(linked) and not all(linked):
            raise ValueError("Cash cannot move between linked and unlinked gangs. Link every gang to an FBRP org first.")
        if not any(linked):
            balances: dict[int, int] = {}
            statements = []
            for row, delta, reason in rows:
                current = balances.get(int(row["id"]), int(row["cash"]))
                after = current + delta
                if after < 0:
                    raise InsufficientFunds(f"{row['name']} only has {current:,} cash.")
                balances[int(row["id"])] = after
                statements.append(("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (row["guild_id"], row["id"], "cash", delta, reason, actor_id)))
            statements.extend(("UPDATE gangs SET cash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (balance, gang_id)) for gang_id, balance in balances.items())
            await self.db.transaction(statements)
            return balances
        try:
            result = await self.api.wallet_batch(
                [{"orgId": row["fbrp_org_id"], "amount": delta, "reason": reason} for row, delta, reason in rows],
                actor_id,
                request_id=request_id,
            )
        except FbrpApiError as error:
            if "only has" in str(error):
                raise InsufficientFunds(str(error)) from None
            raise ValueError(f"Could not update the live organization wallet: {error}") from None
        balances = {
            int(row["id"]): int(remote["balance"])
            for (row, _, _), remote in zip(rows, result["results"], strict=True)
        }
        statements = [
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (row["guild_id"], row["id"], "cash", delta, reason, actor_id))
            for row, delta, reason in rows
        ]
        statements.extend(("UPDATE gangs SET cash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (balance, gang_id)) for gang_id, balance in balances.items())
        await self.db.transaction(statements)
        return balances

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
        if asset == "cash" and (not self.allow_local_cash or source_row.get("fbrp_org_id") or target_row.get("fbrp_org_id")):
            received, fee = deduct_fee(amount, fee_rate)
            await self.change_cash_batch([
                (source_row, -amount, reason),
                (target_row, received, f"{reason} (fee {fee})"),
            ], actor_id)
            return
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
