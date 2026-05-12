const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { readJson } = require("./json-file");
const { opcDir } = require("./paths");

function runCodex(root, item, agentName, prompt) {
  const config = readJson(path.join(opcDir(root), "config.json"));
  const logFile = path.join(item.dir, "logs", `${agentName}.log`);
  const lastMessageFile = path.join(item.dir, "logs", `${agentName}.last.txt`);
  const command = config.codexCommand || "codex";

  return new Promise((resolve, reject) => {
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

    child.on("error", reject);
    child.on("close", (code) => {
      log.end();
      if (code !== 0) reject(new Error(`${agentName} failed with exit code ${code}`));
      else resolve({ logFile, lastMessageFile });
    });
  });
}

module.exports = {
  runCodex
};
