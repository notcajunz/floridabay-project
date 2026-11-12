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
    launch_channel_id: int = 1570223789919174796
    role_action_channel_id: int = 1570223877018353755
    role_conflict_channel_id: int = 1570223903454920837
    staff_bypass_channel_id: int = 1570223895875821588
    staff_bypass_reviewer_role_id: int = 1570223692502278167
    staff_bypass_grant_role_id: int = 1570223752002797688
    multi_gang_bypass_role_ids: tuple[int, ...] = (
        1570223721417801819,
        0,
        1570223692502278167,
    )
    alliance_log_channel_id: int = 1570223906847989952
    punishment_channel_ids: tuple[int, ...] = (
        1570223891757015103,
        1570223876057862164,
    )
    suspension_role_id: int = 1570223704946905098
    suspension_log_channel_id: int = 1570223876057862164
    parole_days: int = 3
    role_management_admin_role_id: int = 1570223690203926562
    gang_role_blocker_role_id: int = 1570223703537487943
    gang_command_role_blocker_role_id: int = 1570223704175018056
    coord_chain_channel_id: int = 1570223782780739665
    gang_tier_channel_id: int = 1570223787734073354
    voice_management_role_ids: tuple[int, ...] = (
        0,
        0,
        0,
        1570223692502278167,
        1570223690203926562,
    )
    trade_channel_id: int = 1570223829257818172
    shop_channel_id: int = 1570223827332632626
    leaderboard_channel_id: int = 1570223824627175559
    hours_channel_id: int = 1570223786609877162
    market_log_channel_id: int = 1570223833905106985
    location_channel_id: int = 1570223864812802178
    server_log_channel_id: int = 1570223907703759012
    voice_log_channel_id: int = 1570223908794404937
    message_log_channel_id: int = 1570223910199234642
    join_leave_log_channel_id: int = 1570223911063527445
    member_log_channel_id: int = 1570223911877087413
    gang_member_role_id: int = 1570223731496722472
    gang_coord_team_role_id: int = 1570223694373199944
    gang_add_remove_role_id: int = 1570223690203926562
    restricted_role_ids: tuple[int, ...] = (
        1570223721417801819,
        0,
    )
    restricted_role_manager_role_ids: tuple[int, ...] = (
        1570223689096495206,
        1570223688689778728,
    )
    gang_manager_plus_role_ids: tuple[int, ...] = (
        1570223688689778728,
        1570223689096495206,
        1570223690203926562,
    )
    coordinator_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Gang Director": 1570223688689778728,
        "Assistant Gang Director": 1570223689096495206,
        "Gang Manager": 1570223690203926562,
        "Lead Gang Coordinator": 1570223690799644805,
        "Senior Gang Coordinator": 1570223691751620628,
        "Gang Coordinator": 1570223692502278167,
        "Trial Gang Coordinator": 1570223693668552804,
    })
    category_coordinator_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Cartel": 1570223699427332146,
        "Militia": 1570223698731081839,
        "Criminal Org": 1570223695551664193,
        "Street Gang": 1570223696164032536,
        "Motorcycle Club": 1570223697166602301,
    })
    category_member_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Cartel": 1570223748534243371,
        "Militia": 1570223747275817022,
        "Criminal Org": 1570223746017529866,
        "Street Gang": 1570223745090715769,
        "Motorcycle Club": 1570223750186799204,
    })
    parole_role_ids: dict[str, int] = field(default_factory=lambda: {
        "Cartel": 1570223713968722091,
        "Militia": 1570223714572959906,
        "Criminal Org": 1570223715671605412,
        "Street Gang": 1570223713087922186,
        "Motorcycle Club": 1570223715227144243,
    })
    coord_channel_ids: dict[str, int] = field(default_factory=lambda: {
        "Cartel": 1570223962456334366,
        "Militia": 1570223953325072569,
        "Criminal Org": 1570223971876478976,
        "Street Gang": 1570223990008582154,
        "Motorcycle Club": 1570223979359248537,
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
            admin_role_id=int(bot_config.get("admin_role_id", 1570223688689778728)),
            command_access=rules,
            administrators_bypass=bool(access_config.get("administrators_bypass", True)),
            owners_bypass=bool(access_config.get("owners_bypass", True)),
            tickets=parse_tickets(raw.get("tickets")),
            launch_channel_id=int(bot_config.get("launch_channel_id", 1570223789919174796)),
            role_action_channel_id=int(bot_config.get("role_action_channel_id", 1570223877018353755)),
            role_conflict_channel_id=int(bot_config.get("role_conflict_channel_id", 1570223903454920837)),
            staff_bypass_channel_id=int(bot_config.get("staff_bypass_channel_id", 1570223895875821588)),
            staff_bypass_reviewer_role_id=int(bot_config.get("staff_bypass_reviewer_role_id", 1570223692502278167)),
            staff_bypass_grant_role_id=int(bot_config.get("staff_bypass_grant_role_id", 1570223752002797688)),
            multi_gang_bypass_role_ids=tuple(
                int(value)
                for value in bot_config.get(
                    "multi_gang_bypass_role_ids",
                    [
                        bot_config.get(
                            "multi_gang_bypass_role_id", 1570223721417801819
                        ),
                        0,
                        1570223692502278167,
                    ],
                )
            ),
            alliance_log_channel_id=int(bot_config.get("alliance_log_channel_id", 1570223906847989952)),
            punishment_channel_ids=tuple(int(value) for value in bot_config.get("punishment_channel_ids", [1570223891757015103, 1570223876057862164])),
            suspension_role_id=int(bot_config.get("suspension_role_id", 1570223704946905098)),
            suspension_log_channel_id=int(bot_config.get("suspension_log_channel_id", 1570223876057862164)),
            parole_days=int(bot_config.get("parole_days", 3)),
            role_management_admin_role_id=int(
                bot_config.get("role_management_admin_role_id", 1570223690203926562)
            ),
            gang_role_blocker_role_id=int(
                bot_config.get("gang_role_blocker_role_id", 1570223703537487943)
            ),
            gang_command_role_blocker_role_id=int(
                bot_config.get(
                    "gang_command_role_blocker_role_id", 1570223704175018056
                )
            ),
            coord_chain_channel_id=int(
                bot_config.get("coord_chain_channel_id", 1570223782780739665)
            ),
            gang_tier_channel_id=int(
                bot_config.get("gang_tier_channel_id", 1570223787734073354)
            ),
            voice_management_role_ids=tuple(
                int(value)
                for value in bot_config.get(
                    "voice_management_role_ids",
                    [
                        0,
                        0,
                        1570223692502278167,
                        1570223690203926562,
                    ],
                )
            ),
            trade_channel_id=int(bot_config.get("trade_channel_id", 1570223829257818172)),
            shop_channel_id=int(bot_config.get("shop_channel_id", 1570223827332632626)),
            leaderboard_channel_id=int(
                bot_config.get("leaderboard_channel_id", 1570223824627175559)
            ),
            hours_channel_id=int(bot_config.get("hours_channel_id", 1570223786609877162)),
            market_log_channel_id=int(
                bot_config.get("market_log_channel_id", 1570223833905106985)
            ),
            location_channel_id=int(bot_config.get("location_channel_id", 1570223864812802178)),
            server_log_channel_id=int(bot_config.get("server_log_channel_id", 1570223907703759012)),
            voice_log_channel_id=int(bot_config.get("voice_log_channel_id", 1570223908794404937)),
            message_log_channel_id=int(bot_config.get("message_log_channel_id", 1570223910199234642)),
            join_leave_log_channel_id=int(bot_config.get("join_leave_log_channel_id", 1570223911063527445)),
            member_log_channel_id=int(bot_config.get("member_log_channel_id", 1570223911877087413)),
            gang_member_role_id=int(bot_config.get("gang_member_role_id", 1570223731496722472)),
            gang_coord_team_role_id=int(
                bot_config.get("gang_coord_team_role_id", 1570223694373199944)
            ),
            gang_add_remove_role_id=int(
                bot_config.get("gang_add_remove_role_id", 1570223690203926562)
            ),
            restricted_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "restricted_role_ids", [1570223721417801819, 0]
                )
            ),
            restricted_role_manager_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "restricted_role_manager_role_ids",
                    [1570223689096495206, 1570223688689778728],
                )
            ),
            gang_manager_plus_role_ids=tuple(
                int(value) for value in bot_config.get(
                    "gang_manager_plus_role_ids",
                    [1570223688689778728, 1570223689096495206, 1570223690203926562],
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
