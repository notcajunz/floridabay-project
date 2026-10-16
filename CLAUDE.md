# Claude Code instructions for Florida Bay RP

Read and follow `AGENTS.md` in this repository before taking action. It is the
authoritative description of the split control/game production topology,
workspace isolation, secret handling, branch workflow, tests, and deployment.

Work in `/home/ubuntu/work/fbrp-claude`, never in `/home/ubuntu/fbrp`. At the
start of each session, read `/home/ubuntu/.config/fbrp-split.env` to identify
whether this is the `control` or `game` host, then fetch `origin` and rebase
your branch on `origin/main`. Never deploy or restart production unless explicitly
asked. A feature that affects both control and game must remain one coherent
Git change and be released using `split-deploy.sh all main` from the control
VPS after review and merge.
