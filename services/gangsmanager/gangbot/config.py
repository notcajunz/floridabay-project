from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True, slots=True)
class AccessRule:
    mode: str = "inherit"
    users: frozenset[int] = frozenset()
    roles: frozenset[int] = frozenset()


@dataclass(frozen=True, slots=True)
class Config:
    token: str
    database_path: Path
    guild_id: int | None
    owner_ids: frozenset[int]
    admin_role_id: int
    command_access: dict[str, AccessRule] = field(default_factory=dict)
    administrators_bypass: bool = True
    owners_bypass: bool = True
    launch_channel_id: int = 1559683475148112043
    role_action_channel_id: int = 1559683682594455654
    role_conflict_channel_id: int = 1559683822600061051
    staff_bypass_channel_id: int = 1559683804963278988
    staff_bypass_reviewer_role_id: int = 1559682511834189974
    staff_bypass_grant_role_id: int = 1559683033576247326
    multi_gang_bypass_role_ids: tuple[int, ...] = (
        1559682626011402332,
        0,
        1559682511834189974,
    )
    alliance_log_channel_id: int = 1559683835439095908
    punishment_channel_ids: tuple[int, ...] = (
        1559683791583191151,
        1559683676328034356,
    )
    suspension_role_id: int = 1559682552145379408
    suspension_log_channel_id: int = 1559683676328034356
    parole_days: int = 3
    role_management_admin_role_id: int = 1559682499251146772
    gang_role_blocker_role_id: int = 1559682547099631696
    gang_command_role_blocker_role_id: int = 1559682550044037120
    coord_chain_channel_id: int = 1559683447470166157
    gang_tier_channel_id: int = 1559683469041471508
    voice_management_role_ids: tuple[int, ...] = (
        0,
        0,
        0,
        1559682511834189974,
        1559682499251146772,
    )
    trade_channel_id: int = 1559683574670692553
    shop_channel_id: int = 1559683570438635550
    leaderboard_channel_id: int = 1559683565007020072
    hours_channel_id: int = 1559683464347918366
    market_log_channel_id: int = 1559683584246153276
    location_channel_id: int = 1559683615875407912
    server_log_channel_id: int = 1559683839851241573
    voice_log_channel_id: int = 1559683844670750730
    message_log_channel_id: int = 1559683848982503434
    join_leave_log_channel_id: int = 1559683853524795423
    member_log_channel_id: int = 1559683857844936877
    gang_member_role_id: int = 1559682966467117066
    gang_coord_team_role_id: int = 1559682517659943033
    gang_add_remove_role_id: int = 1559682499251146772
    restricted_role_ids: tuple[int, ...] = (
        1559682626011402332,
        0,
    )
    restricted_role_manager_role_ids: tuple[int, ...] = (
        1559682496549879808,
        1559682494364647524,
    )
    gang_manager_plus_role_ids: tuple[int, ...] = (
        1559682494364647524,
        1559682496549879808,
        1559682499251146772,
    )
    coordinator_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Gang Director": 1559682494364647524,
        "Assistant Gang Director": 1559682496549879808,
        "Gang Manager": 1559682499251146772,
        "Lead Gang Coordinator": 1559682506033209404,
        "Senior Gang Coordinator": 1559682509233586266,
        "Gang Coordinator": 1559682511834189974,
        "Trial Gang Coordinator": 1559682514518544474,
    })
    category_coordinator_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Cartel": 1559682533405495336,
        "Militia": 1559682529915834382,
        "Criminal Org": 1559682522407768246,
        "Street Gang": 1559682525247439068,
        "Motorcycle Club": 1559682527638061106,
    })
    category_member_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Cartel": 1559683006413934733,
        "Militia": 1559683004010463294,
        "Criminal Org": 1559683002051723386,
        "Street Gang": 1559682999149264896,
        "Motorcycle Club": 1559683010075299880,
    })
    parole_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Cartel": 1559682576250179725,
        "Militia": 1559682579064553502,
        "Criminal Org": 1559682598349840414,
        "Street Gang": 1559682573247053989,
        "Motorcycle Club": 1559682594231291905,
    })
    coord_channel_ids: dict[str, int] = field(default_factory=lambda: {
        "Cartel": 1559684037797355551,
        "Militia": 1559684005564260454,
        "Criminal Org": 1559684064708005928,
        "Street Gang": 1559684130336284692,
        "Motorcycle Club": 1559684092163915876,
    })

    def access_decision(
        self, command: str, user_id: int, role_ids: set[int], *, administrator: bool = False
    ) -> bool | None:
        """Return an explicit config decision, or None when normal checks should apply."""
        if self.owners_bypass and user_id in self.owner_ids:
            return True
        if self.administrators_bypass and administrator:
            return True
        root = command.split(" ", 1)[0]
        rule = next(
            (
                self.command_access[key]
                for key in (command, f"{root} *", "*")
                if key in self.command_access
            ),
            None,
        )
        if rule is None or rule.mode == "inherit":
            return None
        matched = user_id in rule.users or bool(role_ids & rule.roles)
        return matched if rule.mode == "allowlist" else not matched

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv()
        config_path = Path(os.getenv("CONFIG_PATH", "config.toml"))
        raw = {}
        if config_path.exists():
            with config_path.open("rb") as handle:
                raw = tomllib.load(handle)
        bot_config = raw.get("bot", {})
        access_config = raw.get("access", {})
        token = os.getenv("DISCORD_TOKEN", "").strip()
        if not token:
            raise RuntimeError("DISCORD_TOKEN is required. Copy .env.example to .env.")
        guild_raw = os.getenv("DISCORD_GUILD_ID", "").strip() or str(
            bot_config.get("guild_id", "")
        ).strip()
        env_owners = frozenset(
            int(value.strip())
            for value in os.getenv("BOT_OWNER_IDS", "").split(",")
            if value.strip()
        )
        owners = env_owners or frozenset(int(value) for value in bot_config.get("owner_ids", []))
        rules: dict[str, AccessRule] = {}
        categorized_commands: dict[str, str] = {}

        def parse_rule(label: str, value: dict) -> AccessRule:
            mode = str(value.get("mode", "inherit")).lower()
            if mode not in {"inherit", "allowlist", "denylist"}:
                raise RuntimeError(
                    f"Invalid access mode for {label!r}: use inherit, allowlist, or denylist"
                )
            return AccessRule(
                mode=mode,
                users=frozenset(int(item) for item in value.get("users", [])),
                roles=frozenset(int(item) for item in value.get("roles", [])),
            )

        for category, value in access_config.get("categories", {}).items():
            rule = parse_rule(f"category {category}", value)
            for raw_command in value.get("commands", []):
                command = str(raw_command).strip().lower()
                if command in categorized_commands:
                    raise RuntimeError(
                        f"Command {command!r} is listed in both {categorized_commands[command]!r} "
                        f"and {category!r} permission categories"
                    )
                categorized_commands[command] = category
                rules[command] = rule

        # Exact command entries override their permission-category rule.
        for command, value in access_config.get("commands", {}).items():
            rules[command.lower()] = parse_rule(command, value)
        return cls(
            token=token,
            database_path=Path(
                os.getenv("DATABASE_PATH", "").strip()
                or bot_config.get("database_path", "gang_manager.db")
            ),
            guild_id=int(guild_raw) if guild_raw else None,
            owner_ids=owners,
            admin_role_id=int(bot_config.get("admin_role_id", 1559682494364647524)),
            command_access=rules,
            administrators_bypass=bool(access_config.get("administrators_bypass", True)),
            owners_bypass=bool(access_config.get("owners_bypass", True)),
            launch_channel_id=int(bot_config.get("launch_channel_id", 1559683475148112043)),
            role_action_channel_id=int(bot_config.get("role_action_channel_id", 1559683682594455654)),
            role_conflict_channel_id=int(bot_config.get("role_conflict_channel_id", 1559683822600061051)),
            staff_bypass_channel_id=int(bot_config.get("staff_bypass_channel_id", 1559683804963278988)),
            staff_bypass_reviewer_role_id=int(bot_config.get("staff_bypass_reviewer_role_id", 1559682511834189974)),
            staff_bypass_grant_role_id=int(bot_config.get("staff_bypass_grant_role_id", 1559683033576247326)),
            multi_gang_bypass_role_ids=tuple(
                int(value)
                for value in bot_config.get(
                    "multi_gang_bypass_role_ids",
                    [
                        bot_config.get(
                            "multi_gang_bypass_role_id", 1559682626011402332
                        ),
                        0,
                        1559682511834189974,
                    ],
                )
            ),
            alliance_log_channel_id=int(bot_config.get("alliance_log_channel_id", 1559683835439095908)),
            punishment_channel_ids=tuple(int(value) for value in bot_config.get("punishment_channel_ids", [1559683791583191151, 1559683676328034356])),
            suspension_role_id=int(bot_config.get("suspension_role_id", 1559682552145379408)),
            suspension_log_channel_id=int(bot_config.get("suspension_log_channel_id", 1559683676328034356)),
            parole_days=int(bot_config.get("parole_days", 3)),
            role_management_admin_role_id=int(
                bot_config.get("role_management_admin_role_id", 1559682499251146772)
            ),
            gang_role_blocker_role_id=int(
                bot_config.get("gang_role_blocker_role_id", 1559682547099631696)
            ),
            gang_command_role_blocker_role_id=int(
                bot_config.get(
                    "gang_command_role_blocker_role_id", 1559682550044037120
                )
            ),
            coord_chain_channel_id=int(
                bot_config.get("coord_chain_channel_id", 1559683447470166157)
            ),
            gang_tier_channel_id=int(
                bot_config.get("gang_tier_channel_id", 1559683469041471508)
            ),
            voice_management_role_ids=tuple(
                int(value)
                for value in bot_config.get(
                    "voice_management_role_ids",
                    [
                        0,
                        0,
                        1559682511834189974,
                        1559682499251146772,
                    ],
                )
            ),
            trade_channel_id=int(bot_config.get("trade_channel_id", 1559683574670692553)),
            shop_channel_id=int(bot_config.get("shop_channel_id", 1559683570438635550)),
            leaderboard_channel_id=int(
                bot_config.get("leaderboard_channel_id", 1559683565007020072)
            ),
            hours_channel_id=int(bot_config.get("hours_channel_id", 1559683464347918366)),
            market_log_channel_id=int(
                bot_config.get("market_log_channel_id", 1559683584246153276)
            ),
            location_channel_id=int(bot_config.get("location_channel_id", 1559683615875407912)),
            server_log_channel_id=int(bot_config.get("server_log_channel_id", 1559683839851241573)),
            voice_log_channel_id=int(bot_config.get("voice_log_channel_id", 1559683844670750730)),
            message_log_channel_id=int(bot_config.get("message_log_channel_id", 1559683848982503434)),
            join_leave_log_channel_id=int(bot_config.get("join_leave_log_channel_id", 1559683853524795423)),
            member_log_channel_id=int(bot_config.get("member_log_channel_id", 1559683857844936877)),
            gang_member_role_id=int(bot_config.get("gang_member_role_id", 1559682966467117066)),
            gang_coord_team_role_id=int(
                bot_config.get("gang_coord_team_role_id", 1559682517659943033)
            ),
            gang_add_remove_role_id=int(
                bot_config.get("gang_add_remove_role_id", 1559682499251146772)
            ),
            restricted_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "restricted_role_ids", [1559682626011402332, 0]
                )
            ),
            restricted_role_manager_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "restricted_role_manager_role_ids",
                    [1559682496549879808, 1559682494364647524],
                )
            ),
            gang_manager_plus_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "gang_manager_plus_role_ids",
                    [1559682494364647524, 1559682496549879808, 1559682499251146772],
                )
            ),
            coordinator_role_ids={
                str(name): int(value)
                for name, value in bot_config.get("coordinator_role_ids", {}).items()
            },
            category_coordinator_role_ids={
                str(name): int(value)
                for name, value in bot_config.get("category_coordinator_role_ids", {}).items()
            },
            category_member_role_ids={
                str(name): int(value)
                for name, value in bot_config.get("category_member_role_ids", {}).items()
            },
            parole_role_ids={
                str(name): int(value)
                for name, value in bot_config.get("parole_role_ids", {}).items()
            },
            coord_channel_ids={
                str(name): int(value)
                for name, value in bot_config.get("coord_channel_ids", {}).items()
            },
        )
