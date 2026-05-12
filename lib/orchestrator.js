const fs = require("fs");
const path = require("path");
const { agentsDir } = require("./paths");
const { getWorkItem, saveWorkItem } = require("./work-items");
const { runAgentRunner } = require("./runner");

async function runWorkItem(root, id) {
  const item = getWorkItem(root, id);

  if (item.state.status === "created") {
    await runAgent(root, item, "agent_design", "design", "spec.md");
    item.state.status = "design_done";
    saveWorkItem(item);
  }

  if (item.state.status === "design_done") {
    await runAgent(root, item, "agent_code", "code", "implementation.md");
    item.state.status = "code_done";
    saveWorkItem(item);
  }

  if (item.state.status === "code_done" || item.state.status === "verify_failed") {
    await runAgent(root, item, "agent_verify", "verify", "verify.md");

    const verifyStatus = readVerifyStatus(path.join(item.dir, "verify.md"));
    if (verifyStatus === "passed") {
      item.state.status = "verified";
    } else {
      item.state.status = "blocked";
      item.state.blockedReason = "verify reported status: failed";
    }
    saveWorkItem(item);
  }

  if (item.state.status === "verified") {
    await runAgent(root, item, "agent_pr", "pr", "pr.md");
    item.state.status = "done";
    saveWorkItem(item);
  }

  console.log(`${item.state.id} ${item.state.status}`);
}

async function runAgent(root, item, stateAgentName, promptName, requiredArtifact) {
  item.state.currentStep = stateAgentName;
  item.state.activeRun = {
    agent: stateAgentName,
    runId: `RUN-${Date.now()}`,
    status: "running",
    startedAt: new Date().toISOString()
  };
  saveWorkItem(item);

  const prompt = buildPrompt(root, item, promptName);
  try {
    await runAgentRunner(root, item, stateAgentName, prompt);

    if (requiredArtifact) {
      assertRequiredArtifact(item, stateAgentName, requiredArtifact);
    }
  } catch (error) {
    item.state.activeRun = {
      ...item.state.activeRun,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: error.message
    };
    saveWorkItem(item);
    throw enrichAgentError(item, stateAgentName, error);
  }

  item.state.currentStep = null;
  item.state.activeRun = null;
  saveWorkItem(item);
}

function buildPrompt(root, item, promptName) {
  const agentPrompt = fs.readFileSync(path.join(agentsDir(root), `${promptName}.md`), "utf8");
  const rel = path.relative(root, item.dir).replace(/\\/g, "/");

  return `${agentPrompt}

工作目录是项目根目录。
当前工作单目录：${rel}

请读取：
- ${rel}/request.md
- 如果存在，读取 ${rel}/spec.md
- 如果存在，读取 ${rel}/implementation.md
- 如果存在，读取 ${rel}/verify.md

请把你的阶段产物写回当前工作单目录。
不要把 OPC 的过程产物写到其他位置。
`;
}

function assertRequiredArtifact(item, stateAgentName, requiredArtifact) {
  const artifact = path.join(item.dir, requiredArtifact);
  if (!fs.existsSync(artifact) || fs.readFileSync(artifact, "utf8").trim() === "") {
    throw new Error(`${stateAgentName} did not produce ${requiredArtifact}`);
  }

  if (requiredArtifact === "verify.md") {
    readVerifyStatus(artifact);
  }
}

function readVerifyStatus(file) {
  const verify = fs.readFileSync(file, "utf8");
  const passed = /(^|\n)\s*status:\s*passed\s*($|\n)/i.test(verify);
  const failed = /(^|\n)\s*status:\s*failed\s*($|\n)/i.test(verify);

  if (passed && failed) {
    throw new Error("verify.md must contain only one status");
  }

  if (passed) return "passed";
  if (failed) return "failed";

  throw new Error("verify.md must contain status: passed or status: failed");
}

function enrichAgentError(item, stateAgentName, error) {
  const logFile = path.join(item.dir, "logs", `${stateAgentName}.log`);
  const detail = [
    error.message,
    `work item: ${item.dir}`,
    `agent: ${stateAgentName}`,
    `log: ${logFile}`
  ].join("\n");

  const enriched = new Error(detail);
  enriched.cause = error;
  return enriched;
}

module.exports = {
  runWorkItem
};
