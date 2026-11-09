# Sanitized database exports

These SQL files are generated from the current production databases by
`scripts/export-sanitized-databases.mjs`. They contain table definitions and
sanitized current rows, but no usable credentials or direct personal identifiers.

The export process:

- removes passwords, passcodes, tokens, OAuth ciphertext, session hashes,
  webhooks, salts, API keys, and credential-like configuration values;
- consistently pseudonymizes Discord, game-license, platform, and other external
  identifiers so relationships can still be inspected;
- redacts private contact details, personal names in person-centric tables, and
  narrative content such as tickets, applications, case notes, and messages;
- replaces binary/media payloads with empty values; and
- scans every generated file for configured secrets and known token formats,
  failing rather than writing an unsafe release.

These exports are for inspection and development fixtures. They are not a
full-fidelity production restore. The encrypted snapshots remain the authoritative
recovery backups.
