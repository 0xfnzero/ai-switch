#!/usr/bin/env node

import { getPaths } from "./paths.js";
import { getProfile, loadStore } from "./store.js";

const first = process.argv[2];
const target = first === "codex" || first === "claude" ? first : "codex";
const name = target === first ? process.argv[3] : first;
if (!name) process.exit(2);

try {
  const profile = getProfile(loadStore(getPaths()), target, name);
  process.stdout.write(profile.apiKey);
} catch {
  process.exit(1);
}
