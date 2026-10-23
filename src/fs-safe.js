import fs from "node:fs";
import path from "node:path";

export function ensurePrivateDir(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(directory, 0o700);
  } catch {
    // Windows does not implement POSIX mode bits consistently.
  }
}

export function atomicWrite(file, content, mode = 0o600) {
  ensurePrivateDir(path.dirname(file));
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    fs.writeFileSync(temporary, content, { encoding: "utf8", mode });
    try {
      fs.chmodSync(temporary, mode);
    } catch {
      // Best effort on Windows.
    }
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function readText(file, fallback = "") {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}
