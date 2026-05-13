const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { readJson } = require("./json-file");
const { opcDir } = require("./paths");

const defaultTimeoutMs = 20 * 60 * 1000;
const forceKillDelayMs = 5000;

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
    let timedOut = false;
    let forceKillTimer = null;
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
        detached: process.platform !== "win32",
        shell: true,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    const log = fs.createWriteStream(logFile, { flags: "a" });
    child.stdout.on("data", (chunk) => {
      log.write(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      log.write(chunk);
      process.stderr.write(chunk);
    });
    child.stdin.end(prompt);

    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        forceKillTimer = terminateProcessTree(child, (error) => {
          rejectOnce(new Error(`${agentName} timed out after ${timeoutMs}ms and failed to terminate: ${error.message}`));
        });
      } catch (error) {
        rejectOnce(new Error(`${agentName} timed out after ${timeoutMs}ms and failed to terminate: ${error.message}`));
      }
    }, timeoutMs);

    child.on("error", rejectOnce);
    child.on("close", (code) => {
      if (timedOut) rejectOnce(new Error(`${agentName} timed out after ${timeoutMs}ms`));
      else if (code !== 0) rejectOnce(new Error(`${agentName} failed with exit code ${code}`));
      else resolveOnce({ logFile, lastMessageFile });
    });

    function resolveOnce(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      log.end();
      resolve(value);
    }

    function rejectOnce(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      log.end();
      reject(error);
    }
  });
}

function terminateProcessTree(child, onForceKillError) {
  if (!child.pid) return null;

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    killer.on("error", () => child.kill());
    return null;
  }

  killProcessGroup(child.pid, "SIGTERM");
  const timer = setTimeout(() => {
    try {
      killProcessGroup(child.pid, "SIGKILL", { ignoreMissing: true });
    } catch (error) {
      onForceKillError(error);
    }
  }, forceKillDelayMs);
  timer.unref();
  return timer;
}

function killProcessGroup(pid, signal, options = {}) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (options.ignoreMissing && error && error.code === "ESRCH") return;
    throw error;
  }
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
