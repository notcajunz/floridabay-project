#!/usr/bin/env python3
"""Deterministic SQLite-to-SQL export with secrets removed and identifiers pseudonymized."""
import hashlib
import re
import sqlite3
import sys
from pathlib import Path

source, destination = map(Path, sys.argv[1:3])
secret_column = re.compile(r"(^|_)(access_?token|refresh_?token|token|secret|password|passcode|salt|ciphertext|session_?hash|api_?key|auth|credential|webhook|mutation_?token|invite_?code)($|_)", re.I)
private_text = re.compile(r"(^|_)(backstory|reason|notes?|body|answers?|narrative|transcript|statement|evidence|response|findings|form_?data|content|intel|payload|data|roles|members|servers|winners|saved_?roles|details?|decision_?note|review_?note|activity_?note|status_?note|revoke_?reason|close_?reason|removal_?reason)($|_)", re.I)
private_contact = re.compile(r"(^|_)(email|phone|address|birth(date)?|date_of_birth|emergency_contact|ip|imei)($|_)", re.I)
external_id = re.compile(r"(discord|license|identifier|player_key)|(^|_)(guild|channel|role|message|member|actor|author|owner|user|officer|reviewer|inviter|head)_id$|^(requested|added|updated|created|resolved|closed|claimed|decided|granted|removed|revoked|set)_by$|^(subject|target)_id$", re.I)
person_table = re.compile(r"(^|_)(player|players|character|characters|member|members|staff|ticket|tickets|moderation|appeal|discipline|intake|application|applications|roster|phone|sms|contact|mail|case|cases|jail|warrant|criminal|dispatch|identity|session|audit|history|security_event|transcript)(_|$)", re.I)
person_column = re.compile(r"^(name|username|nickname|display_name|first_name|last_name|callsign|plate|owner_name|officer_name|author_name|subject_name|caller_name|character_name|player_name|actor_name|staff_name)$", re.I)
secret_key = re.compile(r"token|secret|password|passcode|salt|api.?key|auth|credential|webhook", re.I)
identifier_value = re.compile(r"^(?:\d{16,20}|(?:license|discord|steam|fivem|xbl|live):[A-Za-z0-9]+|[a-f0-9]{32,})$", re.I)
raw_identifiers = set()
raw_identifier_locations = {}

def quote_name(value):
    return '"' + str(value).replace('"', '""') + '"'

def pseudo(kind, value, declared_type):
    domain = "game_identifier" if re.search(r"license|identifier|player_key", kind, re.I) else "external_identifier"
    digest = hashlib.sha256(f"fbrp-public-sanitized-v1:{domain}:{value}".encode()).hexdigest()
    if re.search(r"INT|REAL|NUM|DEC|FLOAT|DOUBLE", declared_type or "", re.I):
        return 100_000_000_000_000_000 + (int(digest[:16], 16) % 800_000_000_000_000_000)
    return f"anon_{digest[:24]}"

def neutral(declared_type, not_null):
    if not not_null:
        return None
    if re.search(r"INT|REAL|NUM|DEC|FLOAT|DOUBLE", declared_type or "", re.I):
        return 0
    if re.search(r"BLOB|BINARY", declared_type or "", re.I):
        return b""
    return "[redacted]"

def sanitize(table, column, value, declared_type, not_null, is_key, row):
    if value is None:
        return None
    raw = str(value)
    if external_id.search(column) and identifier_value.match(raw):
        raw_identifiers.add(raw)
        raw_identifier_locations.setdefault(raw, set()).add(f"{table}.{column}")
    if isinstance(value, str):
        for match in re.finditer(r"\b(?:license|discord|steam|fivem|xbl|live):[A-Za-z0-9]+\b|\b\d{16,20}\b", value, re.I):
            raw_identifiers.add(match.group(0))
            raw_identifier_locations.setdefault(match.group(0), set()).add(f"{table}.{column}")
    key_text = " ".join(str(v) for k, v in row.items() if re.search(r"(^|_)(key|name)$", k, re.I) and v is not None)
    sensitive = secret_column.search(column) or ((column == "value" or column.endswith("_value")) and secret_key.search(key_text)) or private_text.search(column) or private_contact.search(column) or (person_table.search(table) and person_column.search(column))
    if sensitive:
        return pseudo(column, value, declared_type) if is_key else neutral(declared_type, not_null)
    if external_id.search(column):
        return pseudo(re.sub(r"[^a-z0-9]+", "_", column.lower()), value, declared_type)
    if isinstance(value, bytes):
        return neutral(declared_type, not_null)
    if isinstance(value, str):
        value = re.sub(r"https?://(?:discord(?:app)?\.com)/api/webhooks/[^\s\"']+", "[redacted-webhook]", value, flags=re.I)
        value = re.sub(r"\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}\b", "[redacted-token]", value)
        value = re.sub(r"\bcfxk_[A-Za-z0-9_]{12,}\b", "[redacted-token]", value)
        value = re.sub(r"([?&](?:token|key|secret|signature|auth)=)[^&#\s\"']+", r"\1[redacted]", value, flags=re.I)
        value = re.sub(r"\b(license|discord|steam|fivem|xbl|live):([A-Za-z0-9]+)\b", lambda m: f"{m.group(1)}:anon_{hashlib.sha256(f'fbrp-public-sanitized-v1:external_identifier:{m.group(2)}'.encode()).hexdigest()[:20]}", value, flags=re.I)
        value = re.sub(r"\b[a-f0-9]{32,}\b", lambda m: f"anon_{hashlib.sha256(f'fbrp-public-sanitized-v1:external_identifier:{m.group(0)}'.encode()).hexdigest()[:20]}", value, flags=re.I)
        value = re.sub(r"\b\d{16,20}\b", lambda m: f"anon_{hashlib.sha256(f'fbrp-public-sanitized-v1:external_identifier:{m.group(0)}'.encode()).hexdigest()[:20]}", value)
        value = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[redacted-email]", value, flags=re.I)
    return value

def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, bytes):
        return "X'" + value.hex() + "'"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"

connection = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
connection.row_factory = sqlite3.Row
lines = ["-- Florida Bay SQLite sanitized logical export", "PRAGMA foreign_keys=OFF;", "BEGIN TRANSACTION;", ""]
objects = connection.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 ELSE 3 END,name").fetchall()
for obj in objects:
    if obj["type"] != "table":
        continue
    table = obj["name"]
    lines.extend([f"DROP TABLE IF EXISTS {quote_name(table)};", obj["sql"] + ";"])
    info = connection.execute(f"PRAGMA table_info({quote_name(table)})").fetchall()
    unique_columns = set()
    for index in connection.execute(f"PRAGMA index_list({quote_name(table)})"):
        if index[2]:
            unique_columns.update(item[2] for item in connection.execute(f"PRAGMA index_info({quote_name(index[1])})"))
    columns = [item["name"] for item in info]
    order = [item["name"] for item in info if item["pk"]]
    query = f"SELECT * FROM {quote_name(table)}" + (" ORDER BY " + ",".join(quote_name(item) for item in order) if order else "")
    for raw in connection.execute(query):
        row = dict(raw)
        values = [sanitize(table, item["name"], row[item["name"]], item["type"], bool(item["notnull"]), bool(item["pk"] or item["name"] in unique_columns), row) for item in info]
        lines.append(f"INSERT INTO {quote_name(table)} ({','.join(quote_name(item) for item in columns)}) VALUES ({','.join(sql_value(item) for item in values)});")
    lines.append("")
for obj in objects:
    if obj["type"] != "table":
        lines.append(obj["sql"] + ";")
lines.extend(["COMMIT;", "PRAGMA foreign_keys=ON;", ""])
connection.close()
output = "\n".join(lines)
survivors = [identifier for identifier in raw_identifiers if identifier in output]
if survivors:
    locations = sorted({location for identifier in survivors for location in raw_identifier_locations.get(identifier, set())})
    raise SystemExit("original identifier survived sanitization from: " + ", ".join(locations[:10]))
destination.write_text(output, encoding="utf-8")
