# Claude Code instructions for Florida Bay RP

Read and follow `AGENTS.md` completely before taking action. It is the
authoritative description of the single-host production topology, safety boundaries,
workspace isolation, tests, release locking, and automatic deployment workflow.

Work only in `/home/ubuntu/work/fbrp-claude` and create a unique
`claude/<feature-slug>` branch for each implementation. Never implement a change
in `/home/ubuntu/fbrp`; that is the live production checkout.

The user may give you only the desired result. For ordinary requests to add,
fix, change, remove, or build something, autonomously inspect the project,
implement every affected website, bot and game component, test it, commit and push
the branch, merge it from the release workspace under the shared release lock,
deploy it with `scripts/deploy.sh deploy main --no-restart`, and verify production.
Always deploy with `--no-restart`: every change goes live
except the FiveM server restart, which the owner does in txAdmin (or a
scheduled restart does). Never restart FXServer yourself unless asked.
Do not make the user restate those steps.

Do not deploy when the user asks only for a plan, explanation, review, audit,
status check, or diagnosis, or explicitly says not to deploy. Never broaden a
feature request into DNS changes, credential rotation, destructive data changes,
or work on Corevia/ExeclyAI without explicit authorization.

A feature spanning the website, API, bots, MariaDB compatibility, or FiveM must
remain one coherent Git change and ship in one deployment. If any release step
fails, stop, preserve evidence and recoverable state, and report the failure;
never force-push or improvise a destructive rollback.
