import { OWNER_DISCORD_ID } from "../access-control.js";

/**
 * Dev server transfers. The owner pulls the changed files from the dev game server in the portal and a Claude or Codex CLI
 * integrates them. Only the owner account can see the page, and only TRANSFER_USER_ID can start a transfer.
 */

/** The only Discord account that can open the dev review page. */
export const REVIEW_APPROVER_ID = OWNER_DISCORD_ID;

export const isApprover = (discordId) => String(discordId || "") === REVIEW_APPROVER_ID;

export const AGENTS = Object.freeze(["claude", "codex"]);

/** The only Discord account that can start a dev server transfer. */
export const TRANSFER_USER_ID = "1090083387638812755";
export const canTransfer = (discordId) => String(discordId || "") === TRANSFER_USER_ID;

export const SFTP_REPO = "sftp:dev-server";
export const SFTP_BRANCH = "dev-transfer";

const list = (value, fallback) => {
  const items = String(value || "").split(",").map((item) => item.trim()).filter((item) => /^[A-Za-z0-9._:-]{1,60}$/.test(item));
  return items.length ? items : fallback;
};
/** Models the portal offers per agent. An empty choice means the CLI's own default. */
export const transferModels = (env = process.env) => ({
  claude: list(env.DEV_TRANSFER_MODELS_CLAUDE, ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]),
  codex: list(env.DEV_TRANSFER_MODELS_CODEX, ["gpt-5.6-sol"]),
});
/** Reasoning effort levels the portal offers per agent. An empty choice means the CLI's own default. */
export const transferEfforts = (env = process.env) => ({
  claude: list(env.DEV_TRANSFER_EFFORTS_CLAUDE, ["low", "medium", "high", "xhigh", "max"]),
  codex: list(env.DEV_TRANSFER_EFFORTS_CODEX, ["low", "medium", "high"]),
});
export const INSTRUCTION_LIMIT = 8000;


export const STATUS = Object.freeze({
  queued: "queued",
  transferring: "transferring",
  accepted: "accepted",
  implementing: "implementing",
  implemented: "implemented",
  failed: "failed",
});

export function reviewUrl(submissionId, base = process.env.FBRP_PUBLIC_URL || "") {
  const origin = String(base).replace(/\/$/, "");
  return `${origin}/dev-review${submissionId ? `?id=${encodeURIComponent(submissionId)}` : ""}`;
}
