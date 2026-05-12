const fs = require("fs");
const path = require("path");
const { agentsDir } = require("./paths");
const { getWorkItem, saveWorkItem } = require("./work-items");
const { runAgentRunner } = require("./runner");
const { getStep, isTerminalStatus, resolveStepNext } = require("./workflow");

const maxRetries = 2;

async function runWorkItem(root, id) {
  const item = getWorkItem(root, id);

  while (!isTerminalStatus(item.state.status)) {
    const step = getStep(item.state.status);
    if (!step) throw new Error(`No step configured for status: ${item.state.status}`);

    if (item.state.status === "fixing_code") {
      item.state.fixCount[step.agent] = item.state.fixCount[step.agent] + 1;
      saveWorkItem(item);
    }

    const completed = await runAgentWithRetry(root, item, step);
    if (!completed) break;

    const context = buildStepContext(item, step);
    item.state.status = resolveStepNext(step, context);
    if (item.state.status === "blocked") {
      item.state.blockedReason = blockedReasonFor(context);
    }
    saveWorkItem(item);
  }

  console.log(`${item.state.id} ${item.state.status}`);
}

async function runAgentWithRetry(root, item, step) {
  while (true) {
    try {
      await runAgent(root, item, step.agent, step.prompt, step.requiredArtifact);
      return true;
    } catch (error) {
      const retryCount = item.state.retryCount[step.agent];
      if (retryCount < maxRetries) {
        item.state.retryCount[step.agent] = retryCount + 1;
        saveWorkItem(item);
        continue;
      }

      item.state.status = "blocked";
      item.state.currentStep = null;
      item.state.blockedReason = `${step.agent} failed after ${maxRetries} retries: ${error.message}`;
      saveWorkItem(item);
      return false;
    }
  }
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

function buildStepContext(item, step) {
  if (step.requiredArtifact === "verify.md") {
    const verifyResult = readVerifyResult(path.join(item.dir, "verify.md"));
    return {
      verifyStatus: verifyResult.status,
      responsible: verifyResult.responsible,
      fixCount: item.state.fixCount
    };
  }

  return {};
}

function buildPrompt(root, item, promptName) {
  const agentPrompt = fs.readFileSync(path.join(agentsDir(root), `${promptName}.md`), "utf8");
  const rel = path.relative(root, item.dir).replace(/\\/g, "/");

  return `${agentPrompt}

工作目录是项目根目录。
当前工作单目录：${rel}
当前流程状态：${item.state.status}

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
    readVerifyResult(artifact);
  }
}

function readVerifyResult(file) {
  const verify = fs.readFileSync(file, "utf8");
  const passed = /(^|\n)\s*status:\s*passed\s*($|\n)/i.test(verify);
  const failed = /(^|\n)\s*status:\s*failed\s*($|\n)/i.test(verify);

  if (passed && failed) {
    throw new Error("verify.md must contain only one status");
  }

  if (passed) return { status: "passed", responsible: null };
  if (failed) {
    const responsible = readResponsible(verify);
    if (!responsible) {
      throw new Error("verify.md must contain responsible when status is failed");
    }
    return { status: "failed", responsible };
  }

  throw new Error("verify.md must contain status: passed or status: failed");
}

function readResponsible(verify) {
  const match = verify.match(/(^|\n)\s*responsible:\s*([a-z_]+)\s*($|\n)/i);
  return match ? match[2].toLowerCase() : null;
}

function blockedReasonFor(context) {
  if (context.verifyStatus === "failed") {
    if (context.responsible === "agent_code") {
      return "agent_code fix exceeded limit";
    }
    return `verify reported status: failed, responsible: ${context.responsible || "unknown"}`;
  }

  return "workflow reached blocked";
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
