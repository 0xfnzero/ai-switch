import os from "node:os";
import path from "node:path";

export function getPaths(env = process.env) {
  const home = env.HOME || os.homedir();
  const stateDir = env.AI_SWITCH_HOME || path.join(home, ".ai-switch");
  const codexHome = env.CODEX_HOME || path.join(home, ".codex");
  const claudeHome = env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");

  return {
    home,
    stateDir,
    storeFile: path.join(stateDir, "profiles.json"),
    backupsDir: path.join(stateDir, "backups"),
    codexConfig: path.join(codexHome, "config.toml"),
    claudeSettings: path.join(claudeHome, "settings.json"),
  };
}
