import { createInterface } from "node:readline/promises";

export class Prompter {
  constructor(input = process.stdin, output = process.stdout) {
    this.rl = createInterface({ input, output });
  }

  close() {
    this.rl.close();
  }

  async text(label, options = {}) {
    while (true) {
      const suffix = options.defaultValue ? ` (${options.defaultValue})` : "";
      const value = (await this.rl.question(`${label}${suffix}: `)).trim() || options.defaultValue || "";
      if (!options.required || value) return value;
      console.log("This value is required.");
    }
  }

  async secret(label) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return this.text(label, { required: true });
    process.stdout.write(`${label}: `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = "";
    return new Promise((resolve, reject) => {
      const onData = (buffer) => {
        const char = buffer.toString("utf8");
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Cancelled"));
        } else if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
        } else if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else if (char >= " ") {
          value += char;
        }
      };
      const cleanup = () => {
        process.stdin.off("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
      };
      process.stdin.on("data", onData);
    });
  }

  async confirm(label, defaultValue = true) {
    const hint = defaultValue ? "Y/n" : "y/N";
    const value = (await this.rl.question(`${label} [${hint}]: `)).trim().toLowerCase();
    if (!value) return defaultValue;
    return value === "y" || value === "yes";
  }

  async select(label, choices) {
    console.log(`\n${label}`);
    choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice.label}`));
    while (true) {
      const value = Number.parseInt(await this.rl.question("Choose: "), 10);
      if (value >= 1 && value <= choices.length) return choices[value - 1].value;
      console.log(`Enter a number from 1 to ${choices.length}.`);
    }
  }
}
