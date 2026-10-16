from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

from .tickets import TicketSettings, parse_tickets


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
    tickets: TicketSettings = field(default_factory=TicketSettings)
    launch_channel_id: int = 1559701699013120164
    role_action_channel_id: int = 1559701774150139914
    role_conflict_channel_id: int = 1559701944308604990
    staff_bypass_channel_id: int = 1559701991213764720
    staff_bypass_reviewer_role_id: int = 1559701134686556190
    staff_bypass_grant_role_id: int = 1559701222846500885
    multi_business_bypass_role_ids: tuple[int, ...] = (
        1559701222846500885,
    )
    alliance_log_channel_id: int = 1559701903422783618
    punishment_channel_ids: tuple[int, ...] = (
        1559701778323349524,
        1559701903422783618,
    )
    suspension_role_id: int = 1559701191791747132
    suspension_log_channel_id: int = 1559701778323349524
    parole_days: int = 3
    role_management_admin_role_id: int = 1559701149475536947
    business_role_blocker_role_id: int = 1559701186439815239
    business_command_role_blocker_role_id: int = 1559701188881023076
    coord_chain_channel_id: int = 1559701676443566151
    business_tier_channel_id: int = 1559701694315499671
    voice_management_role_ids: tuple[int, ...] = (
        1559701168542847077,
        1559701149475536947,
        1559701141053513798,
        1559701134686556190,
        1559701131905728532,
    )
    trade_channel_id: int = 1559701911895277669
    shop_channel_id: int = 1559701712338686012
    leaderboard_channel_id: int = 1559701967125876797
    hours_channel_id: int = 1559701689299378217
    market_log_channel_id: int = 1559702019017805886
    location_channel_id: int = 1559701911895277669
    server_log_channel_id: int = 1559702123879342160
    voice_log_channel_id: int = 1559702128669229076
    message_log_channel_id: int = 1559702119228112976
    join_leave_log_channel_id: int = 1559702114979151922
    member_log_channel_id: int = 1559702106800394311
    business_member_role_id: int = 1559701354262302810
    business_coord_team_role_id: int = 1559701166261141534
    business_add_remove_role_id: int = 1559701149475536947
    restricted_role_ids: tuple[int, ...] = (
        1559701222846500885,
    )
    restricted_role_manager_role_ids: tuple[int, ...] = (
        1559701131905728532,
        1559701134686556190,
    )
    business_manager_plus_role_ids: tuple[int, ...] = (
        1559701131905728532,
        1559701134686556190,
        1559701141053513798,
        1559701149475536947,
    )
    coordinator_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Head of Businesses": 1559701131905728532,
        "Business Director": 1559701134686556190,
        "Assistant Business Director": 1559701141053513798,
        "Business Manager": 1559701149475536947,
        "Assistant Business Manager": 1559701151723692174,
        "Lead Business Coordinator": 1559701155603423242,
        "Senior Business Coordinator": 1559701157994307676,
        "Business Coordinator": 1559701161248821318,
        "Trial Business Coordinator": 1559701163459354735,
    })
    category_coordinator_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Car Clubs & Automotive": 1559701172909252711,
        "Security & Protection": 1559701174955933786,
        "Trucking & Contracting": 1559701177732698212,
        "Miscellaneous": 1559701179783708752,
    })
    category_member_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Car Clubs & Automotive": 1559701356468510790,
        "Security & Protection": 1559701358536433756,
        "Trucking & Contracting": 1559701360931512480,
        "Miscellaneous": 1559701363867254865,
    })
    parole_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Car Clubs & Automotive": 1559701211719139348,
        "Security & Protection": 1559701214504026194,
        "Trucking & Contracting": 1559701217842823208,
        "Miscellaneous": 1559701219780333629,
    })
    coord_channel_ids: dict[str, int] = field(default_factory=lambda: {
        "Car Clubs & Automotive": 1559701799500521472,
        "Security & Protection": 1559701830647160832,
        "Trucking & Contracting": 1559701855590817813,
        "Miscellaneous": 1559701885676552303,
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
                or bot_config.get("database_path", "business_manager.db")
            ),
            guild_id=int(guild_raw) if guild_raw else None,
            owner_ids=owners,
            admin_role_id=int(bot_config.get("admin_role_id", 1559701131905728532)),
            command_access=rules,
            administrators_bypass=bool(access_config.get("administrators_bypass", True)),
            owners_bypass=bool(access_config.get("owners_bypass", True)),
            tickets=parse_tickets(raw.get("tickets")),
            launch_channel_id=int(bot_config.get("launch_channel_id", 1559701699013120164)),
            role_action_channel_id=int(bot_config.get("role_action_channel_id", 1559701774150139914)),
            role_conflict_channel_id=int(bot_config.get("role_conflict_channel_id", 1559701944308604990)),
            staff_bypass_channel_id=int(bot_config.get("staff_bypass_channel_id", 1559701991213764720)),
            staff_bypass_reviewer_role_id=int(bot_config.get("staff_bypass_reviewer_role_id", 1559701134686556190)),
            staff_bypass_grant_role_id=int(bot_config.get("staff_bypass_grant_role_id", 1559701222846500885)),
            multi_business_bypass_role_ids=tuple(
                int(value)
                for value in bot_config.get(
                    "multi_business_bypass_role_ids",
                    [
                        bot_config.get(
                            "multi_business_bypass_role_id", 1559701222846500885
                        ),
                        0,
                        1559701134686556190,
                    ],
                )
            ),
            alliance_log_channel_id=int(bot_config.get("alliance_log_channel_id", 1559701903422783618)),
            punishment_channel_ids=tuple(int(value) for value in bot_config.get("punishment_channel_ids", [1559701778323349524, 1559701903422783618])),
            suspension_role_id=int(bot_config.get("suspension_role_id", 1559701191791747132)),
            suspension_log_channel_id=int(bot_config.get("suspension_log_channel_id", 1559701903422783618)),
            parole_days=int(bot_config.get("parole_days", 3)),
            role_management_admin_role_id=int(
                bot_config.get("role_management_admin_role_id", 1559701149475536947)
            ),
            business_role_blocker_role_id=int(
                bot_config.get("business_role_blocker_role_id", 1559701186439815239)
            ),
            business_command_role_blocker_role_id=int(
                bot_config.get(
                    "business_command_role_blocker_role_id", 1559701188881023076
                )
            ),
            coord_chain_channel_id=int(
                bot_config.get("coord_chain_channel_id", 1559701676443566151)
            ),
            business_tier_channel_id=int(
                bot_config.get("business_tier_channel_id", 1559701694315499671)
            ),
            voice_management_role_ids=tuple(
                int(value)
                for value in bot_config.get(
                    "voice_management_role_ids",
                    [
                        0,
                        0,
                        1559701134686556190,
                        1559701149475536947,
                    ],
                )
            ),
            trade_channel_id=int(bot_config.get("trade_channel_id", 1559701911895277669)),
            shop_channel_id=int(bot_config.get("shop_channel_id", 1559701712338686012)),
            leaderboard_channel_id=int(
                bot_config.get("leaderboard_channel_id", 1559701967125876797)
            ),
            hours_channel_id=int(bot_config.get("hours_channel_id", 1559701689299378217)),
            market_log_channel_id=int(
                bot_config.get("market_log_channel_id", 1559702019017805886)
            ),
            location_channel_id=int(bot_config.get("location_channel_id", 1559701911895277669)),
            server_log_channel_id=int(bot_config.get("server_log_channel_id", 1559702123879342160)),
            voice_log_channel_id=int(bot_config.get("voice_log_channel_id", 1559702128669229076)),
            message_log_channel_id=int(bot_config.get("message_log_channel_id", 1559702119228112976)),
            join_leave_log_channel_id=int(bot_config.get("join_leave_log_channel_id", 1559702114979151922)),
            member_log_channel_id=int(bot_config.get("member_log_channel_id", 1559702106800394311)),
            business_member_role_id=int(bot_config.get("business_member_role_id", 1559701354262302810)),
            business_coord_team_role_id=int(
                bot_config.get("business_coord_team_role_id", 1559701166261141534)
            ),
            business_add_remove_role_id=int(
                bot_config.get("business_add_remove_role_id", 1559701149475536947)
            ),
            restricted_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "restricted_role_ids", [1559701222846500885, 0]
                )
            ),
            restricted_role_manager_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "restricted_role_manager_role_ids",
                    [1559701134686556190, 1559701131905728532],
                )
            ),
            business_manager_plus_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "business_manager_plus_role_ids",
                    [1559701131905728532, 1559701134686556190, 1559701149475536947],
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
