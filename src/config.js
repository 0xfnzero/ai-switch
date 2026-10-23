import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWrite, readText } from "./fs-safe.js";

const CODEX_PROVIDER = "aiswitch";
const START = "# >>> ai-switch managed root settings >>>";
const END = "# <<< ai-switch managed root settings <<<";

export function tomlString(value) {
  return JSON.stringify(String(value));
}

function stripManagedRoot(content) {
  const pattern = new RegExp(`(?:^|\\n)${escapeRegExp(START)}\\n[\\s\\S]*?\\n${escapeRegExp(END)}(?:\\n|$)`, "g");
  return content.replace(pattern, "\n").replace(/^\n+/, "");
}

function stripTopLevelKeys(content, keys) {
  const lines = content.split(/\r?\n/);
  let inTable = false;
  return lines
    .filter((line) => {
      if (/^\s*\[/.test(line)) inTable = true;
      if (inTable) return true;
      const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
      return !match || !keys.has(match[1]);
    })
    .join("\n");
}

function stripTomlSection(content, section) {
  const lines = content.split(/\r?\n/);
  const result = [];
  let skipping = false;

  for (const line of lines) {
    const table = line.match(/^\s*\[([^\]]+)]\s*(?:#.*)?$/);
    if (table) skipping = table[1].trim() === section || table[1].trim().startsWith(`${section}.`);
    if (!skipping) result.push(line);
  }
  return result.join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildCodexConfig(existing, profile, runtime = {}) {
  let content = stripManagedRoot(existing);
  content = stripTopLevelKeys(content, new Set(["model_provider", "model", "openai_base_url"]));
  content = stripTomlSection(content, `model_providers.${CODEX_PROVIDER}`).trim();

  const root = [
    START,
    `model_provider = ${tomlString(CODEX_PROVIDER)}`,
    `model = ${tomlString(profile.model)}`,
    END,
  ].join("\n");

  const tokenScript = runtime.tokenScript || path.resolve(fileURLToPath(new URL("./token.js", import.meta.url)));
  const nodeExecutable = runtime.nodeExecutable || process.execPath;
  const provider = [
    `[model_providers.${CODEX_PROVIDER}]`,
    `name = ${tomlString(profile.providerName)}`,
    `base_url = ${tomlString(profile.baseUrl)}`,
    'wire_api = "responses"',
    `auth = { command = ${tomlString(nodeExecutable)}, args = [${tomlString(tokenScript)}, "codex", ${tomlString(profile.name)}] }`,
  ].join("\n");

  return `${root}\n\n${content ? `${content}\n\n` : ""}${provider}\n`;
}

export function applyCodexConfig(paths, profile, runtime) {
  const next = buildCodexConfig(readText(paths.codexConfig), profile, runtime);
  atomicWrite(paths.codexConfig, next, 0o600);
}

export function buildClaudeSettings(existing, profile, runtime = {}) {
  let settings = {};
  if (existing.trim()) {
    try {
      settings = JSON.parse(existing);
    } catch (error) {
      throw new Error(`Cannot parse Claude settings JSON: ${error.message}`);
    }
  }
  settings.env ||= {};
  settings.env.ANTHROPIC_BASE_URL = profile.baseUrl;
  settings.env.ANTHROPIC_MODEL = profile.model;
  delete settings.env.ANTHROPIC_AUTH_TOKEN;
  delete settings.env.ANTHROPIC_API_KEY;
  if (profile.haikuModel) settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = profile.haikuModel;
  if (profile.sonnetModel) settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL = profile.sonnetModel;
  if (profile.opusModel) settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL = profile.opusModel;
  const tokenScript = runtime.tokenScript || path.resolve(fileURLToPath(new URL("./token.js", import.meta.url)));
  const nodeExecutable = runtime.nodeExecutable || process.execPath;
  settings.apiKeyHelper = shellCommand([nodeExecutable, tokenScript, "claude", profile.name], runtime.platform);
  delete settings.aiSwitch;
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function applyClaudeConfig(paths, profile, runtime) {
  const next = buildClaudeSettings(readText(paths.claudeSettings), profile, runtime);
  atomicWrite(paths.claudeSettings, next, 0o600);
}

export function inspectCodexConfig(paths) {
  const content = readText(paths.codexConfig);
  return {
    exists: fs.existsSync(paths.codexConfig),
    managed: content.includes(START),
    provider: extractTomlString(content, "model_provider"),
    model: extractTomlString(content, "model"),
    baseUrl: extractSectionString(content, `model_providers.${CODEX_PROVIDER}`, "base_url"),
    usesCommandAuth: new RegExp(`\\[model_providers\\.${CODEX_PROVIDER.replace(".", "\\.")}].*?^auth\\s*=`, "ms").test(content),
  };
}

export function inspectClaudeConfig(paths) {
  const content = readText(paths.claudeSettings);
  if (!content.trim()) return { exists: false };
  try {
    const settings = JSON.parse(content);
    return {
      exists: true,
      model: settings.env?.ANTHROPIC_MODEL,
      baseUrl: settings.env?.ANTHROPIC_BASE_URL,
      usesCommandAuth: Boolean(settings.apiKeyHelper),
    };
  } catch (error) {
    return { exists: true, error: error.message };
  }
}

function shellCommand(args, platform = process.platform) {
  if (platform === "win32") {
    return args.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(" ");
  }
  return args.map((value) => `'${String(value).replace(/'/g, `'"'"'`)}'`).join(" ");
}

function extractTomlString(content, key) {
  const root = content.split(/^\s*\[/m, 1)[0];
  const match = root.match(new RegExp(`^[ \\t]*${escapeRegExp(key)}[ \\t]*=[ \\t]*"((?:\\\\.|[^"])*)"`, "m"));
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function extractSectionString(content, section, key) {
  const index = content.search(new RegExp(`^[ \\t]*\\[${escapeRegExp(section)}]`, "m"));
  if (index < 0) return undefined;
  const sectionContent = content.slice(index);
  const firstNewline = sectionContent.indexOf("\n");
  if (firstNewline < 0) return undefined;
  const body = sectionContent.slice(firstNewline + 1);
  const nextTable = body.search(/^[ \\t]*\[/m);
  const chunk = nextTable < 0 ? body : body.slice(0, nextTable);
  const match = chunk.match(new RegExp(`^[ \\t]*${escapeRegExp(key)}[ \\t]*=[ \\t]*"((?:\\\\.|[^"])*)"`, "m"));
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}
