# Dev server transfers

The owner portal page **Dev review** (`/dev-review`) has a **Pull from dev server** box. Only the Discord account in
`TRANSFER_USER_ID` (`src/dev-review/config.js`) can use it; the rest of the page is limited to the owner account.

What a pull does:

1. Connects to the dev game server over SFTP and compares every file with a private baseline
   (`/home/ubuntu/.local/state/fbrp-dev-baseline.json`: text files by SHA-256, binaries by size).
2. Downloads only what is new or changed into a staging folder and creates a dev review row already accepted by the owner.
3. The runner (`scripts/dev-submission-implement.sh`, started by the DevOps bot) has the chosen Claude or Codex CLI integrate
   the files. The dev export has every comment stripped, so the agent merges behaviour into the real files. The choice of
   agent, model, reasoning effort and the free-text instructions come from the portal form.
4. The script tests, commits, merges fast-forward only and deploys with `--no-restart`, then verifies production.
5. When the integration succeeds the dev server's current state becomes the new baseline. If it fails, the baseline stays.

The CLI runs with its own login (no API keys), a scoped tool allowlist and a sandbox with no network. It cannot commit, push,
switch branches or deploy; the script does that after checking the changed paths.

Control environment (`services/fbrp-bot/.env`): `FBRP_DEV_SFTP_HOST`, `FBRP_DEV_SFTP_PORT`, `FBRP_DEV_SFTP_USER`,
`FBRP_DEV_SFTP_PASSWORD` (single-quote it if it has special characters), `FBRP_DEV_SFTP_ROOT` (the remote folder that holds
`resources/`), optional `FBRP_DEV_SFTP_HOST_FINGERPRINT` (otherwise the host key is trusted on first use and then pinned).
Optional: `DEV_TRANSFER_MODELS_CLAUDE`, `DEV_TRANSFER_MODELS_CODEX`, `DEV_TRANSFER_EFFORTS_CLAUDE`,
`DEV_TRANSFER_EFFORTS_CODEX` (comma-separated lists for the selectors).

`scripts/dev-export/` builds the comment-stripped export zip and the baseline:
`python3 -I scripts/dev-export/build.py <out.zip> --manifest <baseline.json>` (use `-` instead of a zip to write only the baseline).

The earlier GitHub push review (webhook, OpenAI analysis, accept or decline) was removed. Old rows stay in the table as history.
