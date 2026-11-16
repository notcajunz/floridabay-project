#!/usr/bin/env python3
"""Clear manager-bot runtime data while retaining reusable role/settings config."""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


PRESERVED = {"settings", "permissions", "protected_roles", "role_managers", "dept_role_perms", "stickies"}


def reset(path: Path, execute: bool) -> None:
    connection = sqlite3.connect(path)
    try:
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        wipe = [name for name in tables if name not in PRESERVED]
        print(f"{path}: preserve {len(tables) - len(wipe)} config tables; wipe {len(wipe)} data tables")
        if not execute:
            return
        connection.execute("PRAGMA foreign_keys=OFF")
        connection.execute("BEGIN IMMEDIATE")
        try:
            for name in wipe:
                connection.execute(f'DELETE FROM "{name}"')
            if "permissions" in tables:
                connection.execute("DELETE FROM permissions WHERE target_type='user'")
            if "role_managers" in tables:
                connection.execute("DELETE FROM role_managers WHERE manager_type='user'")
            if "dept_role_perms" in tables:
                connection.execute("DELETE FROM dept_role_perms WHERE subject_type='user'")
            if "sqlite_sequence" in {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}:
                connection.executemany("DELETE FROM sqlite_sequence WHERE name=?", [(name,) for name in wipe])
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("VACUUM")
        for name in wipe:
            count = connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            if count:
                raise RuntimeError(f"{path}: {name} still has {count} rows")
        print(f"{path}: reset verified")
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="perform the reset (default is a dry run)")
    parser.add_argument("databases", nargs="+", type=Path)
    args = parser.parse_args()
    for database in args.databases:
        if not database.is_file():
            raise SystemExit(f"database does not exist: {database}")
        reset(database, args.execute)
    if not args.execute:
        raise SystemExit("dry run only; re-run with --execute after taking backups")


if __name__ == "__main__":
    main()
