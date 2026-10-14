import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callGame } from "./sync.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const PERSONAL_VEHICLES_DIR = process.env.FBRP_VEHICLES_DIR || path.join(repoRoot, "server-data/resources/[vehicles]");
const MODEL = /^[a-z0-9_]{2,40}$/;

export function personalResourceName(modelValue) {
  const model = String(modelValue || "").trim().toLowerCase();
  if (!MODEL.test(model)) throw new Error("Invalid personal vehicle model.");
  return `fbrp_pv_${model}`;
}

/** Stop and remove the exact managed resource directory for a personal vehicle model. */
export async function deletePersonalResource(modelValue) {
  const resource = personalResourceName(modelValue);
  const target = path.join(PERSONAL_VEHICLES_DIR, resource);
  const info = await stat(target).catch(() => null);
  if (!info) return { resource, deleted: false };
  if (!info.isDirectory()) throw new Error(`Cannot delete ${resource}: its server path is not a directory.`);

  const stopped = await callGame("/personals/uninstall", { resource, model: String(modelValue).toLowerCase() }).catch(() => null);
  if (stopped && stopped.ok === false) throw new Error(`Could not stop ${resource} before deleting its files.`);
  await rm(target, { recursive: true, force: false });
  return { resource, deleted: true, stopped: Boolean(stopped?.ok) };
}
