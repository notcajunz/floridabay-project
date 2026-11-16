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
    launch_channel_id: int = 1570224293021753426
    role_action_channel_id: int = 1570224323111813201
    role_conflict_channel_id: int = 1570224362122911786
    staff_bypass_channel_id: int = 1570224381723017338
    staff_bypass_reviewer_role_id: int = 1570224207260942336
    staff_bypass_grant_role_id: int = 1570224234154827910
    multi_business_bypass_role_ids: tuple[int, ...] = (
        1570224234154827910,
    )
    alliance_log_channel_id: int = 1570224351683285295
    punishment_channel_ids: tuple[int, ...] = (
        1570224324131164322,
        1570224351683285295,
    )
    suspension_role_id: int = 1570224223081992313
    suspension_log_channel_id: int = 1570224324131164322
    parole_days: int = 3
    role_management_admin_role_id: int = 1570224209676996699
    business_role_blocker_role_id: int = 1570224221475442720
    business_command_role_blocker_role_id: int = 1570224222511435787
    coord_chain_channel_id: int = 1559701676443566151
    business_tier_channel_id: int = 1570224282540445778
    voice_management_role_ids: tuple[int, ...] = (
        1570224215834234994,
        1570224209676996699,
        1570224208494076035,
        1570224207260942336,
        1570224206354972865,
    )
    trade_channel_id: int = 1570224353969307720
    shop_channel_id: int = 1570224298101178498
    leaderboard_channel_id: int = 1570224376274747403
    hours_channel_id: int = 1570224280124268616
    market_log_channel_id: int = 1570224388316471367
    location_channel_id: int = 1570224353969307720
    server_log_channel_id: int = 1570224406985187339
    voice_log_channel_id: int = 1570224407916453938
    message_log_channel_id: int = 1570224397673824366
    join_leave_log_channel_id: int = 1570224396596150384
    member_log_channel_id: int = 1570224394804924590
    business_member_role_id: int = 1570224238256848896
    business_coord_team_role_id: int = 1570224214571618307
    business_add_remove_role_id: int = 1570224209676996699
    restricted_role_ids: tuple[int, ...] = (
        1570224234154827910,
    )
    restricted_role_manager_role_ids: tuple[int, ...] = (
        1570224206354972865,
        1570224207260942336,
    )
    business_manager_plus_role_ids: tuple[int, ...] = (
        1570224206354972865,
        1570224207260942336,
        1570224208494076035,
        1570224209676996699,
    )
    coordinator_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Head of Businesses": 1570224206354972865,
        "Business Director": 1570224207260942336,
        "Assistant Business Director": 1570224208494076035,
        "Business Manager": 1570224209676996699,
        "Assistant Business Manager": 1570224211212116028,
        "Lead Business Coordinator": 1570224211530748037,
        "Senior Business Coordinator": 1570224212608819200,
        "Business Coordinator": 1570224213359337512,
        "Trial Business Coordinator": 1570224213900660859,
    })
    category_coordinator_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Car Clubs & Automotive": 1570224217155182712,
        "Security & Protection": 1570224217784582274,
        "Trucking & Contracting": 1570224218417668240,
        "Miscellaneous": 1570224219336212571,
    })
    category_member_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Car Clubs & Automotive": 1570224239020351560,
        "Security & Protection": 1570224241297588395,
        "Trucking & Contracting": 1570224241608101984,
        "Miscellaneous": 1570224242673328159,
    })
    parole_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Car Clubs & Automotive": 1570224231231529111,
        "Security & Protection": 1570224231990698128,
        "Trucking & Contracting": 1570224233185812561,
        "Miscellaneous": 1570224233592656006,
    })
    coord_channel_ids: dict[str, int] = field(default_factory=lambda: {
        "Car Clubs & Automotive": 1570224328887505069,
        "Security & Protection": 1570224336462155908,
        "Trucking & Contracting": 1570224341793120400,
        "Miscellaneous": 1570224348042756096,
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
            admin_role_id=int(bot_config.get("admin_role_id", 1570224206354972865)),
            command_access=rules,
            administrators_bypass=bool(access_config.get("administrators_bypass", True)),
            owners_bypass=bool(access_config.get("owners_bypass", True)),
            tickets=parse_tickets(raw.get("tickets")),
            launch_channel_id=int(bot_config.get("launch_channel_id", 1570224293021753426)),
            role_action_channel_id=int(bot_config.get("role_action_channel_id", 1570224323111813201)),
            role_conflict_channel_id=int(bot_config.get("role_conflict_channel_id", 1570224362122911786)),
            staff_bypass_channel_id=int(bot_config.get("staff_bypass_channel_id", 1570224381723017338)),
            staff_bypass_reviewer_role_id=int(bot_config.get("staff_bypass_reviewer_role_id", 1570224207260942336)),
            staff_bypass_grant_role_id=int(bot_config.get("staff_bypass_grant_role_id", 1570224234154827910)),
            multi_business_bypass_role_ids=tuple(
                int(value)
                for value in bot_config.get(
                    "multi_business_bypass_role_ids",
                    [
                        bot_config.get(
                            "multi_business_bypass_role_id", 1570224234154827910
                        ),
                        0,
                        1570224207260942336,
                    ],
                )
            ),
            alliance_log_channel_id=int(bot_config.get("alliance_log_channel_id", 1570224351683285295)),
            punishment_channel_ids=tuple(int(value) for value in bot_config.get("punishment_channel_ids", [1570224324131164322, 1570224351683285295])),
            suspension_role_id=int(bot_config.get("suspension_role_id", 1570224223081992313)),
            suspension_log_channel_id=int(bot_config.get("suspension_log_channel_id", 1570224351683285295)),
            parole_days=int(bot_config.get("parole_days", 3)),
            role_management_admin_role_id=int(
                bot_config.get("role_management_admin_role_id", 1570224209676996699)
            ),
            business_role_blocker_role_id=int(
                bot_config.get("business_role_blocker_role_id", 1570224221475442720)
            ),
            business_command_role_blocker_role_id=int(
                bot_config.get(
                    "business_command_role_blocker_role_id", 1570224222511435787
                )
            ),
            coord_chain_channel_id=int(
                bot_config.get("coord_chain_channel_id", 1559701676443566151)
            ),
            business_tier_channel_id=int(
                bot_config.get("business_tier_channel_id", 1570224282540445778)
            ),
            voice_management_role_ids=tuple(
                int(value)
                for value in bot_config.get(
                    "voice_management_role_ids",
                    [
                        0,
                        0,
                        1570224207260942336,
                        1570224209676996699,
                    ],
                )
            ),
            trade_channel_id=int(bot_config.get("trade_channel_id", 1570224353969307720)),
            shop_channel_id=int(bot_config.get("shop_channel_id", 1570224298101178498)),
            leaderboard_channel_id=int(
                bot_config.get("leaderboard_channel_id", 1570224376274747403)
            ),
            hours_channel_id=int(bot_config.get("hours_channel_id", 1570224280124268616)),
            market_log_channel_id=int(
                bot_config.get("market_log_channel_id", 1570224388316471367)
            ),
            location_channel_id=int(bot_config.get("location_channel_id", 1570224353969307720)),
            server_log_channel_id=int(bot_config.get("server_log_channel_id", 1570224406985187339)),
            voice_log_channel_id=int(bot_config.get("voice_log_channel_id", 1570224407916453938)),
            message_log_channel_id=int(bot_config.get("message_log_channel_id", 1570224397673824366)),
            join_leave_log_channel_id=int(bot_config.get("join_leave_log_channel_id", 1570224396596150384)),
            member_log_channel_id=int(bot_config.get("member_log_channel_id", 1570224394804924590)),
            business_member_role_id=int(bot_config.get("business_member_role_id", 1570224238256848896)),
            business_coord_team_role_id=int(
                bot_config.get("business_coord_team_role_id", 1570224214571618307)
            ),
            business_add_remove_role_id=int(
                bot_config.get("business_add_remove_role_id", 1570224209676996699)
            ),
            restricted_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "restricted_role_ids", [1570224234154827910, 0]
                )
            ),
            restricted_role_manager_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "restricted_role_manager_role_ids",
                    [1570224207260942336, 1570224206354972865],
                )
            ),
            business_manager_plus_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "business_manager_plus_role_ids",
                    [1570224206354972865, 1570224207260942336, 1570224209676996699],
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
