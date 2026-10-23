import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { modelWithPrompt } from "../src/cli.js";
import { getPaths } from "../src/paths.js";
import { fetchModels, modelsEndpoint, probeProfile } from "../src/probe.js";
import { emptyStore, getProfile, loadStore, putProfile, saveStore } from "../src/store.js";

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Codex model discovery uses the configured base path and sorts newest first", async () => {
  await withServer((request, response) => {
    assert.equal(request.url, "/v1/models");
    assert.equal(request.headers.authorization, "Bearer test-key");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      object: "list",
      data: [
        { id: "older", created: 100 },
        { id: "newer", created: 200 },
        { id: "newer", created: 200 },
      ],
    }));
  }, async (origin) => {
    const profile = { target: "codex", baseUrl: `${origin}/v1`, apiKey: "test-key" };
    const result = await fetchModels(profile);
    assert.deepEqual(result.models.map((model) => model.id), ["newer", "older"]);
    assert.equal(modelsEndpoint(profile).toString(), `${origin}/v1/models`);
  });
});

test("Claude model discovery accepts display names and sends Anthropic headers", async () => {
  await withServer((request, response) => {
    assert.equal(request.url, "/v1/models");
    assert.equal(request.headers["x-api-key"], "claude-key");
    assert.equal(request.headers["anthropic-version"], "2023-06-01");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      data: [{ id: "claude-latest", display_name: "Claude Latest", created_at: "2026-10-18T00:00:00Z" }],
    }));
  }, async (origin) => {
    const result = await fetchModels({ target: "claude", baseUrl: origin, apiKey: "claude-key" });
    assert.equal(result.models[0].id, "claude-latest");
    assert.equal(result.models[0].displayName, "Claude Latest");
  });
});

test("model discovery errors redact the API key", async () => {
  await withServer((request, response) => {
    response.statusCode = 401;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: { message: "Rejected test-secret" } }));
  }, async (origin) => {
    const profile = { target: "codex", baseUrl: `${origin}/v1`, apiKey: "test-secret" };
    await assert.rejects(fetchModels(profile), /Rejected \[redacted]/);
    const probe = await probeProfile(profile);
    assert.equal(probe.ok, false);
    assert.doesNotMatch(probe.detail, /test-secret/);
  });
});

test("model command fetches the live catalog and saves the selected model", async () => {
  await withServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      data: [
        { id: "new-model", created: 200 },
        { id: "old-model", created: 100 },
      ],
    }));
  }, async (origin) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-switch-model-"));
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
      baseUrl: `${origin}/v1`,
      model: "old-model",
      apiKey: "test-key",
    });
    saveStore(paths, store);

    const prompt = {
      select: async (label, choices) => {
        assert.equal(label, "Model");
        return choices[0].value;
      },
      text: async () => assert.fail("manual model input should not be requested"),
    };
    await modelWithPrompt(paths, prompt, "codex", "relay");
    assert.equal(getProfile(loadStore(paths), "codex", "relay").model, "new-model");
  });
});
