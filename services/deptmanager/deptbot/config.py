from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

from .tickets import TicketSettings, parse_tickets

from .constants import COORDINATOR_RANKS, DEFAULT_LEVEL_RANKS, DEPARTMENT_CATEGORIES


@dataclass(frozen=True, slots=True)
class AccessRule:
    mode: str = "inherit"
    users: frozenset[int] = frozenset()
    roles: frozenset[int] = frozenset()


def _ids(value) -> tuple[int, ...]:
    return tuple(int(item) for item in value or [] if int(item))


def _id_map(value) -> dict[str, int]:
    return {str(name): int(role_id) for name, role_id in (value or {}).items() if int(role_id)}


@dataclass(frozen=True, slots=True)
class Config:
    token: str
    database_path: Path
    guild_id: int | None
    owner_ids: frozenset[int]
    command_access: dict[str, AccessRule] = field(default_factory=dict)
    administrators_bypass: bool = True
    owners_bypass: bool = True
    tickets: TicketSettings = field(default_factory=TicketSettings)
    # Roles that pass every rank check (network management).
    bypass_role_ids: tuple[int, ...] = ()
    # Channels. 0 disables a channel.
    movement_channel_id: int = 0
    member_movement_channel_id: int = 0
    coord_movement_channel_id: int = 0
    status_channel_id: int = 0
    chain_of_command_channel_id: int = 0
    hours_channel_id: int = 0
    transfer_log_channel_id: int = 0
    transfer_blacklist_log_channel_id: int = 0
    role_conflict_channel_id: int = 0
    email_channel_id: int = 0
    email_log_channel_id: int = 0
    punishment_channel_ids: tuple[int, ...] = ()
    custom_message_log_channel_id: int = 0
    server_log_channel_id: int = 0
    channel_log_channel_id: int = 0
    member_log_channel_id: int = 0
    join_leave_log_channel_id: int = 0
    message_log_channel_id: int = 0
    # Roles.
    member_role_id: int = 0
    suspension_role_id: int = 0
    transfer_blacklist_role_id: int = 0
    coord_team_role_id: int = 0
    multi_department_bypass_role_ids: tuple[int, ...] = ()
    restricted_role_ids: tuple[int, ...] = ()
    restricted_role_manager_role_ids: tuple[int, ...] = ()
    transfer_cooldown_days: int = 7
    resignation_cooldown_days: int = 3
    hours_days: int = 7
    base_role_format: str = "FBRP | {initials}"
    command_role_format: str = "{initials} High Command"
    coordinator_role_ids: dict[str, int] = field(default_factory=dict)
    coordinator_job_role_ids: dict[str, int] = field(default_factory=dict)
    category_member_role_ids: dict[str, int] = field(default_factory=dict)
    transfer_cooldown_role_ids: dict[str, int] = field(default_factory=dict)
    resignation_cooldown_role_ids: dict[str, int] = field(default_factory=dict)
    level_ranks: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_LEVEL_RANKS))
    # Servers without the coordinator ladder (Armed Forces) list the roles that reach each
    # permission level instead, and the chain of command is built from `positions`.
    level_roles: dict[str, tuple[int, ...]] = field(default_factory=dict)
    positions: dict[str, int] = field(default_factory=dict)
    # Position names after which the chain of command leaves a gap.
    position_breaks: tuple[str, ...] = ()
    # Only coordinators, positions and the department's own high command may change department roles.
    strict_department_roles: bool = False
    # Lowest coordination rank that approves or denies email database access requests.
    email_approver_rank: str = "Senior Department Coordinator"
    launch_group_role_id: int = 0

    def cooldown_role_id(self, kind: str, category: str) -> int:
        roles = self.transfer_cooldown_role_ids if kind == "Transfer" else self.resignation_cooldown_role_ids
        return roles.get(category, 0)

    def cooldown_days(self, kind: str) -> int:
        return self.transfer_cooldown_days if kind == "Transfer" else self.resignation_cooldown_days

    def all_cooldown_role_ids(self) -> set[int]:
        return {*self.transfer_cooldown_role_ids.values(), *self.resignation_cooldown_role_ids.values()}

    def coordinator_role_set(self) -> set[int]:
        return {
            *self.coordinator_role_ids.values(), *self.coordinator_job_role_ids.values(),
            *self.positions.values(), self.coord_team_role_id,
        } - {0}

    def position_index(self, role_ids: set[int]) -> int | None:
        """Index of the highest chain-of-command position held (0 is the top), or None."""
        for index, role_id in enumerate(self.positions.values()):
            if role_id in role_ids:
                return index
        return None

    def rank_index(self, role_ids: set[int]) -> int | None:
        """Index of the highest ladder rank held (0 is the top), or None."""
        for index, rank in enumerate(COORDINATOR_RANKS):
            if self.coordinator_role_ids.get(rank, 0) in role_ids:
                return index
        return None

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
        token = os.getenv("DISCORD_TOKEN", "").strip()
        if not token:
            raise RuntimeError("DISCORD_TOKEN is required. Copy .env.example to .env.")
        return cls.from_mapping(raw, token=token)

    @classmethod
    def from_mapping(cls, raw: dict, *, token: str = "") -> "Config":
        bot = raw.get("bot", {})
        access_config = raw.get("access", {})
        guild_raw = os.getenv("DISCORD_GUILD_ID", "").strip() or str(bot.get("guild_id", "")).strip()
        env_owners = frozenset(
            int(value.strip()) for value in os.getenv("BOT_OWNER_IDS", "").split(",") if value.strip()
        )
        rules: dict[str, AccessRule] = {}
        categorized: dict[str, str] = {}

        def parse_rule(label: str, value: dict) -> AccessRule:
            mode = str(value.get("mode", "inherit")).lower()
            if mode not in {"inherit", "allowlist", "denylist"}:
                raise RuntimeError(f"Invalid access mode for {label!r}: use inherit, allowlist, or denylist")
            return AccessRule(
                mode=mode,
                users=frozenset(int(item) for item in value.get("users", [])),
                roles=frozenset(int(item) for item in value.get("roles", [])),
            )

        for category, value in access_config.get("categories", {}).items():
            rule = parse_rule(f"category {category}", value)
            for raw_command in value.get("commands", []):
                command = str(raw_command).strip().lower()
                if command in categorized:
                    raise RuntimeError(
                        f"Command {command!r} is listed in both {categorized[command]!r} and {category!r}"
                    )
                categorized[command] = category
                rules[command] = rule
        # Exact command entries override their permission-category rule.
        for command, value in access_config.get("commands", {}).items():
            rules[command.lower()] = parse_rule(command, value)

        coordinator_role_ids = _id_map(bot.get("coordinator_role_ids"))
        unknown = set(coordinator_role_ids) - set(COORDINATOR_RANKS)
        if unknown:
            raise RuntimeError(f"Unknown coordinator ranks in config: {', '.join(sorted(unknown))}")
        level_ranks = {**DEFAULT_LEVEL_RANKS, **{str(k): str(v) for k, v in bot.get("level_ranks", {}).items()}}
        for level, rank in level_ranks.items():
            if rank not in COORDINATOR_RANKS:
                raise RuntimeError(f"level_ranks.{level} must be a coordinator rank, not {rank!r}")
        for key in ("category_member_role_ids", "transfer_cooldown_role_ids", "resignation_cooldown_role_ids"):
            unknown = set(bot.get(key, {})) - set(DEPARTMENT_CATEGORIES)
            if unknown:
                raise RuntimeError(f"Unknown department categories in {key}: {', '.join(sorted(unknown))}")

        email_approver_rank = str(bot.get("email_approver_rank", "Senior Department Coordinator"))
        if email_approver_rank not in COORDINATOR_RANKS:
            raise RuntimeError(f"email_approver_rank must be a coordinator rank, not {email_approver_rank!r}")

        def channel(name: str) -> int:
            return int(bot.get(name, 0) or 0)

        return cls(
            token=token,
            database_path=Path(
                os.getenv("DATABASE_PATH", "").strip() or bot.get("database_path", "department_manager.db")
            ),
            guild_id=int(guild_raw) if guild_raw else None,
            owner_ids=env_owners or frozenset(int(value) for value in bot.get("owner_ids", [])),
            command_access=rules,
            administrators_bypass=bool(access_config.get("administrators_bypass", True)),
            owners_bypass=bool(access_config.get("owners_bypass", True)),
            tickets=parse_tickets(raw.get("tickets")),
            bypass_role_ids=_ids(bot.get("bypass_role_ids")),
            movement_channel_id=channel("movement_channel_id"),
            member_movement_channel_id=channel("member_movement_channel_id"),
            coord_movement_channel_id=channel("coord_movement_channel_id"),
            status_channel_id=channel("status_channel_id"),
            chain_of_command_channel_id=channel("chain_of_command_channel_id"),
            hours_channel_id=channel("hours_channel_id"),
            transfer_log_channel_id=channel("transfer_log_channel_id"),
            transfer_blacklist_log_channel_id=channel("transfer_blacklist_log_channel_id"),
            role_conflict_channel_id=channel("role_conflict_channel_id"),
            email_channel_id=channel("email_channel_id"),
            email_log_channel_id=channel("email_log_channel_id"),
            punishment_channel_ids=_ids(bot.get("punishment_channel_ids")),
            custom_message_log_channel_id=channel("custom_message_log_channel_id"),
            server_log_channel_id=channel("server_log_channel_id"),
            channel_log_channel_id=channel("channel_log_channel_id"),
            member_log_channel_id=channel("member_log_channel_id"),
            join_leave_log_channel_id=channel("join_leave_log_channel_id"),
            message_log_channel_id=channel("message_log_channel_id"),
            member_role_id=channel("member_role_id"),
            suspension_role_id=channel("suspension_role_id"),
            transfer_blacklist_role_id=channel("transfer_blacklist_role_id"),
            coord_team_role_id=channel("coord_team_role_id"),
            multi_department_bypass_role_ids=_ids(bot.get("multi_department_bypass_role_ids")),
            restricted_role_ids=_ids(bot.get("restricted_role_ids")),
            restricted_role_manager_role_ids=_ids(bot.get("restricted_role_manager_role_ids")),
            transfer_cooldown_days=int(bot.get("transfer_cooldown_days", 7)),
            resignation_cooldown_days=int(bot.get("resignation_cooldown_days", 3)),
            hours_days=int(bot.get("hours_days", 7)),
            base_role_format=str(bot.get("base_role_format", "FBRP | {initials}")),
            command_role_format=str(bot.get("command_role_format", "{initials} High Command")),
            coordinator_role_ids=coordinator_role_ids,
            coordinator_job_role_ids=_id_map(bot.get("coordinator_job_role_ids")),
            category_member_role_ids=_id_map(bot.get("category_member_role_ids")),
            transfer_cooldown_role_ids=_id_map(bot.get("transfer_cooldown_role_ids")),
            resignation_cooldown_role_ids=_id_map(bot.get("resignation_cooldown_role_ids")),
            level_ranks=level_ranks,
            level_roles={str(k): _ids(v) for k, v in bot.get("level_roles", {}).items()},
            positions=_id_map(bot.get("positions")),
            strict_department_roles=bool(bot.get("strict_department_roles", False)),
            position_breaks=tuple(str(v) for v in bot.get("position_breaks", [])),
            email_approver_rank=email_approver_rank,
            launch_group_role_id=channel("launch_group_role_id"),
        )
