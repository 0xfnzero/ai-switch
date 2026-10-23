import fs from "node:fs";
import path from "node:path";
import { backupFiles, listBackups, restoreBackup } from "./backup.js";
import {
  applyClaudeConfig,
  applyCodexConfig,
  inspectClaudeConfig,
  inspectCodexConfig,
} from "./config.js";
import { getPaths } from "./paths.js";
import { fetchModels, probeProfile, requestEndpoint } from "./probe.js";
import { Prompter } from "./prompt.js";
import {
  assertPrivateStore,
  getProfile,
  loadStore,
  profilesFor,
  putProfile,
  saveStore,
} from "./store.js";

const VERSION = "0.2.0";

export async function main(argv) {
  const paths = getPaths();
  const [command = "interactive", ...args] = argv;

  if (["-h", "--help", "help"].includes(command)) return printHelp();
  if (["-v", "--version", "version"].includes(command)) return console.log(VERSION);
  if (command === "token") return tokenCommand(paths, args);
  if (command === "list" || command === "ls") return listCommand(paths, args);
  if (command === "use") return useCommand(paths, args);
  if (command === "doctor") return doctorCommand(paths, args);
  if (command === "backup") return backupCommand(paths, args);
  if (command === "remove") return removeCommand(paths, args);
  if (command === "model" || command === "models") return modelCommand(paths, args);
  if (command === "add") return addCommand(paths, args);
  if (command !== "interactive") throw new Error(`Unknown command: ${command}. Run ai-switch --help.`);
  return interactive(paths);
}

function printHelp() {
  console.log(`ai-switch ${VERSION}

Configure API providers and relay endpoints for Codex and Claude Code.

Usage:
  ai-switch                  Interactive menu
  ai-switch add [target]     Add or update a profile (codex|claude)
  ai-switch model [target] [profile]
  ai-switch use <target> <name>
  ai-switch list [target]
  ai-switch doctor [--probe]
  ai-switch backup list
  ai-switch backup restore [name]
  ai-switch remove <target> <name>

Aliases: ais

Environment:
  AI_SWITCH_HOME       Profile store (default: ~/.ai-switch)
  CODEX_HOME           Codex directory (default: ~/.codex)
  CLAUDE_CONFIG_DIR    Claude directory (default: ~/.claude)`);
}

async function interactive(paths) {
  const prompt = new Prompter();
  try {
    console.log("\nAI Switch - Codex / Claude Code provider manager");
    const action = await prompt.select("What do you want to do?", [
      { label: "Add or update a provider", value: "add" },
      { label: "Switch active provider", value: "use" },
      { label: "Change model", value: "model" },
      { label: "List profiles", value: "list" },
      { label: "Run diagnostics", value: "doctor" },
      { label: "Restore a backup", value: "restore" },
    ]);
    if (action === "add") return addWithPrompt(paths, prompt);
    if (action === "use") return useWithPrompt(paths, prompt);
    if (action === "model") return modelWithPrompt(paths, prompt);
    if (action === "list") return listCommand(paths, []);
    if (action === "doctor") return doctorCommand(paths, []);
    if (action === "restore") return restoreWithPrompt(paths, prompt);
  } finally {
    prompt.close();
  }
}

async function addCommand(paths, args) {
  const prompt = new Prompter();
  try {
    return addWithPrompt(paths, prompt, args[0]);
  } finally {
    prompt.close();
  }
}

async function addWithPrompt(paths, prompt, requestedTarget) {
  const target = requestedTarget || await prompt.select("Target", [
    { label: "Codex (Responses API)", value: "codex" },
    { label: "Claude Code (Anthropic-compatible API)", value: "claude" },
  ]);
  if (!new Set(["codex", "claude"]).has(target)) throw new Error("Target must be codex or claude");

  const officialUrl = target === "codex" ? "https://api.openai.com/v1" : "https://api.anthropic.com";
  const name = await prompt.text("Profile name", { required: true });
  const providerName = await prompt.text("Display name", { defaultValue: name });
  const baseUrl = await prompt.text("API base URL", { defaultValue: officialUrl, required: true });
  const apiKey = await prompt.secret("API key (input is hidden)");
  const profile = { target, name, providerName, baseUrl, apiKey };
  const selection = await selectRemoteModel(prompt, profile);
  profile.model = selection.model;

  if (target === "claude" && await prompt.confirm("Configure Haiku/Sonnet/Opus aliases", false)) {
    profile.haikuModel = await selectModelFromCatalog(prompt, "Haiku model alias", selection.models, profile.model);
    profile.sonnetModel = await selectModelFromCatalog(prompt, "Sonnet model alias", selection.models, profile.model);
    profile.opusModel = await selectModelFromCatalog(prompt, "Opus model alias", selection.models, profile.model);
  }

  const store = loadStore(paths);
  const saved = putProfile(store, profile);
  saveStore(paths, store);
  console.log(`\nSaved ${target}/${name}. Key: ${maskSecret(apiKey)}`);
  console.log(`Expected request endpoint: ${requestEndpoint(saved)}`);

  if (await prompt.confirm("Activate this profile now", true)) {
    activate(paths, store, saved);
  }
  if (await prompt.confirm("Test the non-billing /models endpoint", false)) {
    await printProbe(saved);
  }
}

async function selectRemoteModel(prompt, profile, defaultModel) {
  console.log(`\nFetching available models from ${profile.baseUrl.replace(/\/+$/, "")} ...`);
  let result;
  try {
    result = await fetchModels(profile);
  } catch (error) {
    const status = error.status ? `HTTP ${error.status}: ` : "";
    console.log(`Could not fetch models (${status}${error.message}).`);
    const model = await prompt.text("Model name", { defaultValue: defaultModel, required: true });
    return { model, models: [] };
  }
  console.log(`Found ${result.models.length} models.`);
  const model = await selectModelFromCatalog(prompt, "Model", result.models, defaultModel);
  return { model, models: result.models };
}

async function selectModelFromCatalog(prompt, label, models, defaultModel) {
  if (!models?.length) {
    return prompt.text(label, { defaultValue: defaultModel, required: true });
  }
  const manual = "__ai_switch_manual_model__";
  const choices = models.map((model) => ({
    label: model.displayName && model.displayName !== model.id
      ? `${model.displayName} (${model.id})`
      : model.id,
    value: model.id,
  }));
  choices.push({ label: "Enter a model name manually", value: manual });
  const selected = await prompt.select(label, choices);
  return selected === manual
    ? prompt.text("Model name", { defaultValue: defaultModel, required: true })
    : selected;
}

async function modelCommand(paths, args) {
  const prompt = new Prompter();
  try {
    return modelWithPrompt(paths, prompt, args[0], args[1]);
  } finally {
    prompt.close();
  }
}

export async function modelWithPrompt(paths, prompt, requestedTarget, requestedName) {
  const store = loadStore(paths);
  const target = requestedTarget || await prompt.select("Target", [
    { label: "Codex", value: "codex" },
    { label: "Claude Code", value: "claude" },
  ]);
  if (!new Set(["codex", "claude"]).has(target)) throw new Error("Target must be codex or claude");
  const profiles = profilesFor(store, target);
  if (profiles.length === 0) throw new Error(`No ${target} profiles. Run ai-switch add ${target}.`);
  const name = requestedName || await prompt.select("Profile", profiles.map((profile) => ({
    label: `${profile.name} - ${profile.providerName}`,
    value: profile.name,
  })));
  const profile = getProfile(store, target, name);
  const selection = await selectRemoteModel(prompt, profile, profile.model);
  if (selection.model === profile.model) return console.log(`Model unchanged: ${profile.model}`);

  const updated = putProfile(store, { ...profile, model: selection.model });
  saveStore(paths, store);
  console.log(`Saved model ${updated.model} for ${target}/${name}.`);
  if (store.active[target] === name) activate(paths, store, updated);
}

function activate(paths, store, profile) {
  const targetFile = profile.target === "codex" ? paths.codexConfig : paths.claudeSettings;
  const backup = backupFiles(paths, [targetFile], `switch-${profile.target}`);
  if (profile.target === "codex") applyCodexConfig(paths, profile);
  else applyClaudeConfig(paths, profile);
  store.active[profile.target] = profile.name;
  saveStore(paths, store);
  console.log(`Activated ${profile.target}/${profile.name}.`);
  if (backup) console.log(`Backup: ${backup}`);
  console.log("Restart the target application or start a new session for the change to take effect.");
}

async function useCommand(paths, args) {
  if (args.length < 2) {
    const prompt = new Prompter();
    try {
      return useWithPrompt(paths, prompt, args[0]);
    } finally {
      prompt.close();
    }
  }
  const [target, name] = args;
  const store = loadStore(paths);
  activate(paths, store, getProfile(store, target, name));
}

async function useWithPrompt(paths, prompt, requestedTarget) {
  const store = loadStore(paths);
  const target = requestedTarget || await prompt.select("Target", [
    { label: "Codex", value: "codex" },
    { label: "Claude Code", value: "claude" },
  ]);
  const profiles = profilesFor(store, target);
  if (profiles.length === 0) throw new Error(`No ${target} profiles. Run ai-switch add ${target}.`);
  const name = await prompt.select("Profile", profiles.map((profile) => ({
    label: `${profile.name} - ${profile.providerName} / ${profile.model}`,
    value: profile.name,
  })));
  activate(paths, store, getProfile(store, target, name));
}

function listCommand(paths, args) {
  const target = args[0];
  if (target && !new Set(["codex", "claude"]).has(target)) throw new Error("Target must be codex or claude");
  const store = loadStore(paths);
  const profiles = profilesFor(store, target);
  if (profiles.length === 0) return console.log("No profiles configured.");
  for (const profile of profiles) {
    const active = store.active[profile.target] === profile.name ? "*" : " ";
    console.log(`${active} ${profile.target.padEnd(6)} ${profile.name.padEnd(18)} ${profile.model}  ${profile.baseUrl}  ${maskSecret(profile.apiKey)}`);
  }
}

async function doctorCommand(paths, args) {
  const store = loadStore(paths);
  const codex = inspectCodexConfig(paths);
  const claude = inspectClaudeConfig(paths);
  const permissionIssue = assertPrivateStore(paths);
  let failures = 0;

  console.log("AI Switch diagnostics\n");
  failures += printCheck("Profile store", fs.existsSync(paths.storeFile), paths.storeFile);
  failures += printCheck("Profile permissions", !permissionIssue, permissionIssue || "600");
  if (store.active.codex) {
    failures += printCheck("Codex config managed", codex.managed, paths.codexConfig);
    failures += printCheck("Codex provider", codex.provider === "aiswitch", codex.provider || "missing");
    failures += printCheck("Codex command auth", codex.usesCommandAuth, "no API key stored in config.toml");
    console.log(`  Codex model: ${codex.model || "unknown"}`);
    console.log(`  Codex base URL: ${codex.baseUrl || "unknown"}`);
  } else {
    console.log("SKIP Codex: no active AI Switch profile");
  }
  if (store.active.claude) {
    failures += printCheck("Claude settings parse", claude.exists && !claude.error, claude.error || paths.claudeSettings);
    failures += printCheck("Claude command auth", claude.usesCommandAuth, "no API key stored in settings.json");
    console.log(`  Claude profile: ${store.active.claude}`);
    console.log(`  Claude model: ${claude.model || "unknown"}`);
    console.log(`  Claude base URL: ${claude.baseUrl || "unknown"}`);
    if (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY) {
      console.log("WARN Claude environment already contains an API credential; it can override apiKeyHelper.");
    }
  } else {
    console.log("SKIP Claude Code: no active AI Switch profile");
  }

  for (const target of ["codex", "claude"]) {
    const active = store.active[target];
    if (!active) continue;
    const profile = getProfile(store, target, active);
    console.log(`  ${target} expected endpoint: ${requestEndpoint(profile)}`);
    if (args.includes("--probe")) await printProbe(profile);
  }
  if (failures) process.exitCode = 1;
}

function printCheck(label, ok, detail) {
  console.log(`${ok ? "OK " : "ERR"} ${label}: ${detail}`);
  return ok ? 0 : 1;
}

async function printProbe(profile) {
  const result = await probeProfile(profile);
  console.log(`${result.ok ? "OK" : "ERR"} ${result.url} -> ${result.status || "network error"}: ${result.detail || "no response body"}`);
}

function backupCommand(paths, args) {
  const action = args[0] || "list";
  if (action === "list") {
    const backups = listBackups(paths);
    if (backups.length === 0) return console.log("No backups found.");
    backups.forEach((backup) => console.log(`${backup.name}  ${backup.files.length} file(s)  ${backup.reason}`));
    return;
  }
  if (action === "restore") {
    const name = args[1];
    const backups = listBackups(paths);
    const backup = name ? backups.find((item) => item.name === name) : backups[0];
    if (!backup) throw new Error(name ? `Backup not found: ${name}` : "No backups found");
    const safety = backupFiles(paths, backup.files.map((file) => file.source), "before-restore");
    restoreBackup(backup);
    const store = loadStore(paths);
    if (backup.files.some((file) => file.source === paths.codexConfig)) delete store.active.codex;
    if (backup.files.some((file) => file.source === paths.claudeSettings)) delete store.active.claude;
    saveStore(paths, store);
    console.log(`Restored ${backup.name}.`);
    if (safety) console.log(`Pre-restore backup: ${safety}`);
    return;
  }
  throw new Error("Usage: ai-switch backup list|restore [name]");
}

async function restoreWithPrompt(paths, prompt) {
  const backups = listBackups(paths);
  if (backups.length === 0) throw new Error("No backups found");
  const name = await prompt.select("Backup", backups.map((backup) => ({
    label: `${backup.name} (${backup.reason})`, value: backup.name,
  })));
  if (await prompt.confirm(`Restore ${name}`, false)) backupCommand(paths, ["restore", name]);
}

function removeCommand(paths, args) {
  const [target, name] = args;
  if (!target || !name) throw new Error("Usage: ai-switch remove <codex|claude> <name>");
  const store = loadStore(paths);
  const key = `${target}:${name}`;
  if (!store.profiles[key]) throw new Error(`Profile not found: ${target}/${name}`);
  if (store.active[target] === name) {
    throw new Error(`Cannot remove active profile ${target}/${name}. Switch to another profile or restore a backup first.`);
  }
  delete store.profiles[key];
  saveStore(paths, store);
  console.log(`Removed ${target}/${name} from the profile store. Target application config was left unchanged.`);
}

function tokenCommand(paths, args) {
  const target = args[0] === "codex" || args[0] === "claude" ? args[0] : "codex";
  const name = target === args[0] ? args[1] : args[0];
  const profile = getProfile(loadStore(paths), target, name);
  process.stdout.write(profile.apiKey);
}

export function maskSecret(secret) {
  if (!secret) return "(none)";
  if (secret.length <= 8) return "*".repeat(secret.length);
  return `${secret.slice(0, 4)}${"*".repeat(Math.min(12, secret.length - 8))}${secret.slice(-4)}`;
}
