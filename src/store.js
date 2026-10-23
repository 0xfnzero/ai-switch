import fs from "node:fs";
import { atomicWrite, ensurePrivateDir, readText } from "./fs-safe.js";

export const TARGETS = new Set(["codex", "claude"]);

export function emptyStore() {
  return { version: 1, profiles: {}, active: {} };
}

export function loadStore(paths) {
  const raw = readText(paths.storeFile);
  if (!raw.trim()) return emptyStore();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Cannot parse ${paths.storeFile}: ${error.message}`);
  }

  if (parsed?.version !== 1 || typeof parsed.profiles !== "object") {
    throw new Error(`Unsupported profile store format in ${paths.storeFile}`);
  }
  parsed.active ||= {};
  return parsed;
}

export function saveStore(paths, store) {
  ensurePrivateDir(paths.stateDir);
  atomicWrite(paths.storeFile, `${JSON.stringify(store, null, 2)}\n`, 0o600);
}

export function profileKey(target, name) {
  return `${target}:${name}`;
}

export function validateProfile(profile) {
  if (!TARGETS.has(profile.target)) throw new Error("Target must be codex or claude");
  if (!profile.name || !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(profile.name)) {
    throw new Error("Profile name must be 1-64 letters, numbers, dots, underscores, or dashes");
  }
  if (!profile.model?.trim()) throw new Error("Model cannot be empty");
  if (!profile.apiKey?.trim()) throw new Error("API key cannot be empty");

  let url;
  try {
    url = new URL(profile.baseUrl);
  } catch {
    throw new Error("Base URL must be a valid absolute URL");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("Base URL must use http or https");
  }
  if (url.username || url.password) throw new Error("Base URL must not contain credentials");
  if (url.search || url.hash) throw new Error("Base URL must not contain a query or fragment");
}

export function putProfile(store, profile) {
  validateProfile(profile);
  const normalized = {
    ...profile,
    name: profile.name.trim(),
    providerName: profile.providerName?.trim() || profile.name.trim(),
    baseUrl: profile.baseUrl.replace(/\/+$/, ""),
    model: profile.model.trim(),
    apiKey: profile.apiKey.trim(),
    updatedAt: new Date().toISOString(),
  };
  store.profiles[profileKey(normalized.target, normalized.name)] = normalized;
  return normalized;
}

export function getProfile(store, target, name) {
  const profile = store.profiles[profileKey(target, name)];
  if (!profile) throw new Error(`Profile not found: ${target}/${name}`);
  return profile;
}

export function profilesFor(store, target) {
  return Object.values(store.profiles)
    .filter((profile) => !target || profile.target === target)
    .sort((a, b) => `${a.target}:${a.name}`.localeCompare(`${b.target}:${b.name}`));
}

export function assertPrivateStore(paths) {
  if (process.platform === "win32" || !fs.existsSync(paths.storeFile)) return null;
  const mode = fs.statSync(paths.storeFile).mode & 0o777;
  return mode === 0o600 ? null : `Profile store permissions are ${mode.toString(8)}; expected 600`;
}
