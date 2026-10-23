import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { getPaths } from "../src/paths.js";
import { emptyStore, getProfile, loadStore, putProfile, saveStore } from "../src/store.js";

test("profile store round trips and is private", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-switch-home-"));
  const paths = getPaths({ HOME: home });
  const store = emptyStore();
  putProfile(store, {
    target: "codex",
    name: "relay",
    baseUrl: "https://relay.example/v1/",
    model: "gpt-test",
    apiKey: "secret",
  });
  saveStore(paths, store);
  const loaded = loadStore(paths);
  assert.equal(getProfile(loaded, "codex", "relay").baseUrl, "https://relay.example/v1");
  if (process.platform !== "win32") assert.equal(fs.statSync(paths.storeFile).mode & 0o777, 0o600);
});

test("profile validation rejects credentials in URLs", () => {
  const store = emptyStore();
  assert.throws(() => putProfile(store, {
    target: "claude",
    name: "bad",
    baseUrl: "https://user:password@example.com",
    model: "x",
    apiKey: "secret",
  }), /must not contain credentials/);
});
