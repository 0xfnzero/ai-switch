import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { getPaths } from "../src/paths.js";
import { emptyStore, putProfile, saveStore } from "../src/store.js";

const entry = path.resolve("bin/ai-switch.js");
const tokenEntry = path.resolve("src/token.js");

function run(args, env) {
  return spawnSync(process.execPath, [entry, ...args], { env, encoding: "utf8" });
}

test("CLI switches both clients without embedding secrets in target configs", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-switch-integration-"));
  const env = {
    ...process.env,
    HOME: home,
    AI_SWITCH_HOME: path.join(home, ".ai-switch"),
    CODEX_HOME: path.join(home, ".codex"),
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
  };
  const paths = getPaths(env);
  const store = emptyStore();
  putProfile(store, {
    target: "codex",
    name: "relay",
    providerName: "Relay",
    baseUrl: "https://relay.example/v1",
    model: "gpt-test",
    apiKey: "codex-super-secret",
  });
  putProfile(store, {
    target: "claude",
    name: "relay",
    providerName: "Relay",
    baseUrl: "https://relay.example",
    model: "claude-test",
    apiKey: "claude-super-secret",
  });
  saveStore(paths, store);

  const codex = run(["use", "codex", "relay"], env);
  assert.equal(codex.status, 0, codex.stderr);
  const codexConfig = fs.readFileSync(paths.codexConfig, "utf8");
  assert.match(codexConfig, /\[model_providers\.aiswitch]/);
  assert.doesNotMatch(codexConfig, /codex-super-secret/);
  assert.doesNotMatch(codex.stdout, /codex-super-secret/);

  const claude = run(["use", "claude", "relay"], env);
  assert.equal(claude.status, 0, claude.stderr);
  const claudeSettings = fs.readFileSync(paths.claudeSettings, "utf8");
  assert.match(claudeSettings, /apiKeyHelper/);
  assert.doesNotMatch(claudeSettings, /claude-super-secret/);
  assert.doesNotMatch(claude.stdout, /claude-super-secret/);
  const helper = JSON.parse(claudeSettings).apiKeyHelper;
  const helperResult = spawnSync(helper, { env, encoding: "utf8", shell: true });
  assert.equal(helperResult.status, 0, helperResult.stderr);
  assert.equal(helperResult.stdout, "claude-super-secret");

  const codexToken = spawnSync(process.execPath, [tokenEntry, "codex", "relay"], { env, encoding: "utf8" });
  const claudeToken = spawnSync(process.execPath, [tokenEntry, "claude", "relay"], { env, encoding: "utf8" });
  assert.equal(codexToken.stdout, "codex-super-secret");
  assert.equal(claudeToken.stdout, "claude-super-secret");

  const doctor = run(["doctor"], env);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.doesNotMatch(doctor.stdout, /super-secret/);

  const removeActive = run(["remove", "codex", "relay"], env);
  assert.notEqual(removeActive.status, 0);
  assert.match(removeActive.stderr, /Cannot remove active profile/);
});
