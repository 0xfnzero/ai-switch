import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildClaudeSettings, buildCodexConfig, inspectCodexConfig } from "../src/config.js";
import { atomicWrite } from "../src/fs-safe.js";
import { requestEndpoint } from "../src/probe.js";

const codexProfile = {
  target: "codex",
  name: "relay",
  providerName: "My Relay",
  baseUrl: "https://relay.example/v1",
  model: "gpt-test",
  apiKey: "sk-secret",
};

test("Codex config preserves unrelated settings and never embeds the key", () => {
  const existing = `model_provider = "custom"\nmodel = "old"\n\n[desktop]\nappearanceTheme = "dark"\n\n[model_providers.custom]\nbase_url = "https://old.example/v1"\n`;
  const result = buildCodexConfig(existing, codexProfile, {
    nodeExecutable: "/usr/bin/node",
    tokenScript: "/tool/token.js",
  });
  assert.match(result, /model_provider = "aiswitch"/);
  assert.match(result, /model = "gpt-test"/);
  assert.match(result, /\[desktop]/);
  assert.match(result, /\[model_providers\.custom]/);
  assert.match(result, /\[model_providers\.aiswitch]/);
  assert.match(result, /base_url = "https:\/\/relay\.example\/v1"/);
  assert.match(result, /auth = \{ command = "\/usr\/bin\/node", args = \["\/tool\/token.js", "codex", "relay"\]/);
  assert.doesNotMatch(result, /sk-secret/);
  assert.equal((result.match(/model_provider =/g) || []).length, 1);
});

test("Codex managed section is idempotent", () => {
  const first = buildCodexConfig("[desktop]\nfoo = true\n", codexProfile, {
    nodeExecutable: "/usr/bin/node",
    tokenScript: "/tool/token.js",
  });
  const second = buildCodexConfig(first, codexProfile, {
    nodeExecutable: "/usr/bin/node",
    tokenScript: "/tool/token.js",
  });
  assert.equal(second, first);
});

test("Claude settings preserve unrelated settings and use a key helper", () => {
  const result = JSON.parse(buildClaudeSettings('{"permissions":{"allow":["Read"]},"env":{"KEEP":"yes","ANTHROPIC_AUTH_TOKEN":"old"}}', {
    target: "claude",
    name: "relay",
    baseUrl: "https://relay.example",
    model: "claude-test",
    apiKey: "secret",
  }, { nodeExecutable: "/usr/bin/node", tokenScript: "/tool/token.js", platform: "linux" }));
  assert.deepEqual(result.permissions, { allow: ["Read"] });
  assert.equal(result.env.KEEP, "yes");
  assert.equal(result.env.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(result.apiKeyHelper, "'/usr/bin/node' '/tool/token.js' 'claude' 'relay'");
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test("inspectCodexConfig reads managed settings", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-switch-"));
  const config = path.join(directory, "config.toml");
  atomicWrite(config, buildCodexConfig("", codexProfile, {
    nodeExecutable: "/usr/bin/node",
    tokenScript: "/tool/token.js",
  }));
  const result = inspectCodexConfig({ codexConfig: config });
  assert.equal(result.provider, "aiswitch");
  assert.equal(result.model, "gpt-test");
  assert.equal(result.baseUrl, "https://relay.example/v1");
  assert.equal(result.usesCommandAuth, true);
});

test("request endpoints reflect each client's URL convention", () => {
  assert.equal(requestEndpoint(codexProfile), "https://relay.example/v1/responses");
  assert.equal(requestEndpoint({ target: "claude", baseUrl: "https://relay.example" }), "https://relay.example/v1/messages");
  assert.equal(requestEndpoint({ target: "claude", baseUrl: "https://relay.example/v1" }), "https://relay.example/v1/messages");
});
