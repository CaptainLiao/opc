const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { readJson } = require("./json-file");
const { opcDir } = require("./paths");

const defaultTimeoutMs = 20 * 60 * 1000;

function runAgentRunner(root, item, agentName, prompt) {
  const config = readJson(path.join(opcDir(root), "config.json"));
  const logFile = path.join(item.dir, "logs", `${agentName}.log`);
  const lastMessageFile = path.join(item.dir, "logs", `${agentName}.last.txt`);
  const runner = normalizeRunner(config.runner || "codex");
  if (runner.provider !== "codex") throw new Error(`Unsupported runner provider: ${runner.provider}`);
  const command = runner.command || "codex";
  const timeoutMs = config.timeoutMs || defaultTimeoutMs;

  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(
      command,
      [
        "--ask-for-approval",
        "never",
        "exec",
        "--cd",
        root,
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "--output-last-message",
        lastMessageFile,
        "-"
      ],
      {
        cwd: root,
        shell: true,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    const log = fs.createWriteStream(logFile, { flags: "a" });
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    child.stdin.end(prompt);

    const timeout = setTimeout(() => {
      child.kill();
      rejectOnce(new Error(`${agentName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", rejectOnce);
    child.on("close", (code) => {
      if (code !== 0) rejectOnce(new Error(`${agentName} failed with exit code ${code}`));
      else resolveOnce({ logFile, lastMessageFile });
    });

    function resolveOnce(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      log.end();
      resolve(value);
    }

    function rejectOnce(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      log.end();
      reject(error);
    }
  });
}

function normalizeRunner(value) {
  if (typeof value === "string") {
    return { provider: value, command: value };
  }
  return value;
}

module.exports = {
  runAgentRunner
};
