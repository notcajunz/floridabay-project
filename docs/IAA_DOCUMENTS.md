# IAA roster, SOP and locked alt database

IAA Systems (`services/fbrp-bot/src/iaa`) keeps three private Google files for the Internal Affairs Agency:

| Key | File | Contents |
| --- | --- | --- |
| `roster` | IAA Roster (Sheet) | The old CIA workbook layout, filled IAA-native: **Homepage** (overview and counts), **Master Roster** (callsign, rank, tier, status, divisions, dates), **Employee Database** (discipline counts, cases led, awards, leave), **Authority Matrix** (permission by tier, read live from the bot) and **Punishment Guideline**. Rewritten when the roster changes and every 10 minutes. |
| `sop` | IAA SOP (Doc) | The agency handbook converted from the old CIA SOP (`src/iaa/sop-content.js`), with the live strike/inactivity settings and rank ladder filled in. Every command it mentions is checked against the real command list in tests. |
| `alts` | IAA Alt Database (Sheet, tab `LOCKED`) | Alt-account records with evidence. View-only for everyone it is shared with. |

## Privacy model

- Google does not let a service account own files, so a person (the server owner) creates the three files in their own Drive. They are private to that person until shared.
- The only account they are shared with directly is the IAA Systems service account, as **Editor**. It writes the content and manages everyone else's access.
- The only way anyone else gets in is `/iaa-docs access grant`, which shares with one named Google account (no link sharing, no notification email) and records who approved it. Google file IDs live only in the `iaa_documents` table.
- Every 10 minutes the bot ends access held by anyone who is no longer an active agent. Every 6 hours `audit` removes any Google permission that is not on the access list.
- **Offboarding is automatic.** `separate()` (remove, retire, case outcomes, blacklist), a member leaving the IAA server (`autoSeparate`) and the reconcile sweep all end document access, free the callsign and rewrite the roster sheet.

## Commands (`/iaa-docs`)

| Command | Needs |
| --- | --- |
| `link <document> <url>` | `admin` (High Command). Attaches a Google file that was shared with the bot as Editor; the bot adds the tab and fills it. |
| `setup [email]` | `admin`. Only works where Google allows the bot to create files (it normally does not); use `link`. |
| `sync` | `admin`. Rewrites all files and removes unrecorded sharing. |
| `open <document>` | Anyone who was granted access. |
| `access grant / revoke / list` | `docs.grant` (Low Command). The locked alt database needs `docs.locked` (High Command) and a Supervisor-or-above target. |
| `alt add / remove / list` | `docs.alts` (Low Command). |

## Setup

1. In Google Cloud, create a service account and download its JSON key. Enable the **Google Drive**, **Google Sheets** and **Google Docs** APIs in that project.
2. Put the key outside the repository and set `IAA_GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/key.json` in `services/fbrp-bot/.env` (mode 600).
3. In Google Drive create one Doc (the SOP) and two Sheets (the roster and the locked alt database). Share each with the service account's `client_email` as **Editor**.
4. Start IAA Systems and run `/iaa-docs link` once per file with its URL. Everyone else is added with `/iaa-docs access grant`.
