import fs from "node:fs";
import path from "node:path";
import { ensurePrivateDir } from "./fs-safe.js";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function backupFiles(paths, files, reason) {
  const existing = files.filter((file) => fs.existsSync(file));
  if (existing.length === 0) return null;

  const directory = path.join(paths.backupsDir, `${stamp()}-${reason}`);
  ensurePrivateDir(directory);
  const manifest = { version: 1, createdAt: new Date().toISOString(), reason, files: [] };

  for (const source of existing) {
    const name = source === paths.codexConfig ? "codex-config.toml" : "claude-settings.json";
    const destination = path.join(directory, name);
    fs.copyFileSync(source, destination);
    try {
      fs.chmodSync(destination, 0o600);
    } catch {
      // Best effort on Windows.
    }
    manifest.files.push({ source, backup: name });
  }
  fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  return directory;
}

export function listBackups(paths) {
  if (!fs.existsSync(paths.backupsDir)) return [];
  return fs
    .readdirSync(paths.backupsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = path.join(paths.backupsDir, entry.name);
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
        return { directory, name: entry.name, ...manifest };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function restoreBackup(backup) {
  for (const file of backup.files) {
    ensurePrivateDir(path.dirname(file.source));
    fs.copyFileSync(path.join(backup.directory, file.backup), file.source);
  }
}
