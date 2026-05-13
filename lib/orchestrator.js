const fs = require("fs");
const path = require("path");
const { agentsDir, opcDir } = require("./paths");
const { readJson } = require("./json-file");
const { getWorkItem, saveWorkItem } = require("./work-items");
const { runAgentRunner } = require("./runner");
const { getStep, isTerminalStatus, resolveStep, resolveStepNext } = require("./workflow");

const maxRetries = 2;
const artifactOrder = ["spec.md", "implementation.md", "verify.md", "pr.md"];

async function runWorkItem(root, id) {
  const item = getWorkItem(root, id);
  logProgress(`Running ${item.state.id} (${path.relative(root, item.dir).replace(/\\/g, "/")})`);

  while (!isTerminalStatus(item.state.status)) {
    const step = resolveConfiguredStep(root, item, getStep(item.state.status));
    if (!step) throw new Error(`No step configured for status: ${item.state.status}`);
    if (step.blockedReason) {
      const previousStatus = item.state.status;
      item.state.status = "blocked";
      item.state.currentStep = null;
      item.state.blockedReason = step.blockedReason;
      saveWorkItem(item);
      logProgress(`${previousStatus} -> blocked`);
      break;
    }

    if (item.state.status === "fixing_code") {
      item.state.fixCount[step.agent] = item.state.fixCount[step.agent] + 1;
      saveWorkItem(item);
    }

    const completed = await runAgentWithRetry(root, item, step);
    if (!completed) break;

    updateWorkItemMetadata(item, step);
    const context = buildStepContext(item, step);
    const previousStatus = item.state.status;
    item.state.status = resolveStepNext(step, context);
    if (item.state.status === "blocked") {
      item.state.blockedReason = blockedReasonFor(context);
    }
    saveWorkItem(item);
    logProgress(`${previousStatus} -> ${item.state.status}`);
  }

  logProgress(`Finished ${item.state.id}: ${item.state.status}`);
  console.log(`${item.state.id} ${item.state.status}`);
}

async function runAgentWithRetry(root, item, step) {
  while (true) {
    try {
      await runAgent(root, item, step);
      return true;
    } catch (error) {
      const retryCount = item.state.retryCount[step.agent] || 0;
      if (retryCount < maxRetries) {
        item.state.retryCount[step.agent] = retryCount + 1;
        saveWorkItem(item);
        logProgress(`${step.agent} failed, retrying (${item.state.retryCount[step.agent]}/${maxRetries})`);
        continue;
      }

      item.state.status = "blocked";
      item.state.currentStep = null;
      item.state.blockedReason = `${step.agent} failed after ${maxRetries} retries: ${error.message}`;
      saveWorkItem(item);
      logProgress(`${step.agent} failed after ${maxRetries} retries; blocked`);
      return false;
    }
  }
}

async function runAgent(root, item, step) {
  const stateAgentName = step.agent;
  const promptName = step.prompt;
  const requiredArtifact = step.requiredArtifact;
  const started = Date.now();

  clearStaleArtifacts(item, step);

  item.state.currentStep = stateAgentName;
  item.state.activeRun = {
    agent: stateAgentName,
    runId: `RUN-${Date.now()}`,
    status: "running",
    startedAt: new Date().toISOString()
  };
  saveWorkItem(item);

  const prompt = buildPrompt(root, item, promptName);
  logProgress(`Starting ${stateAgentName} (${promptName})`);
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
  logProgress(`Completed ${stateAgentName} in ${formatDuration(Date.now() - started)}`);
}

function clearStaleArtifacts(item, step) {
  const artifacts = staleArtifactsForStep(item.state.status, step.requiredArtifact);
  for (const artifact of artifacts) {
    fs.rmSync(path.join(item.dir, artifact), { force: true });
  }

  if (step.prompt === "ui-verify") {
    const screenshotsDir = path.join(item.dir, "screenshots");
    fs.rmSync(screenshotsDir, { recursive: true, force: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
}

function staleArtifactsForStep(status, requiredArtifact) {
  if (status === "fixing_code") return ["implementation.md", "pr.md"];

  const index = artifactOrder.indexOf(requiredArtifact);
  if (index === -1) return [];
  return artifactOrder.slice(index);
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
  const extraContext = promptName === "ui-verify" ? buildUiContext(root, item) : "";

  return `${agentPrompt}

工作目录是项目根目录。
当前工作单目录：${rel}
当前流程状态：${item.state.status}
${extraContext}

请读取：
- ${rel}/request.md
- 如果存在，读取 ${rel}/spec.md
- 如果存在，读取 ${rel}/implementation.md
- 如果存在，读取 ${rel}/testcases.md
- 如果存在，读取 ${rel}/verify.md

请把你的阶段产物写回当前工作单目录。
不要把 OPC 的过程产物写到其他位置。
`;
}

function resolveConfiguredStep(root, item, step) {
  if (!step) return null;
  return resolveStep(step, buildWorkflowContext(root, item));
}

function buildWorkflowContext(root, item) {
  return {
    uiVerifyConfigured: Boolean(readConfig(root).ui),
    uiVerifyRequested: requiresUiVerification(item)
  };
}

function requiresUiVerification(item) {
  if (item.state.verification && item.state.verification.ui) return true;

  const specFile = path.join(item.dir, "spec.md");
  if (!fs.existsSync(specFile)) return false;
  return /(^|\n)\s*uiVerification\s*:\s*required\s*($|\n)/i.test(fs.readFileSync(specFile, "utf8"));
}

function updateWorkItemMetadata(item, step) {
  if (step.requiredArtifact !== "spec.md") return;

  const specFile = path.join(item.dir, "spec.md");
  if (!fs.existsSync(specFile)) return;

  const requiresUi = /(^|\n)\s*uiVerification\s*:\s*required\s*($|\n)/i.test(fs.readFileSync(specFile, "utf8"));
  item.state.verification = {
    ...(item.state.verification || {}),
    ui: requiresUi
  };
  saveWorkItem(item);
}

function buildUiContext(root, item) {
  const config = readConfig(root);
  const ui = config.ui || {};
  const screenshotsDir = path.relative(root, path.join(item.dir, "screenshots")).replace(/\\/g, "/");

  return `

UI 验证配置：
- baseUrl: ${ui.baseUrl || ""}
- startCommands:
${formatStartCommands(ui.startCommands || ui.startCommand)}
- timeoutMs: ${ui.timeoutMs || 60000}
- screenshotsDir: ${screenshotsDir}
`;
}

function formatStartCommands(value) {
  const commands = Array.isArray(value) ? value : value ? [value] : [];
  if (commands.length === 0) return "  - 无";

  return commands
    .map((command) => {
      if (typeof command === "string") return `  - ${command}`;
      return `  - ${command.name || command.command}: ${command.command}`;
    })
    .join("\n");
}

function readConfig(root) {
  const configFile = path.join(opcDir(root), "config.json");
  if (!fs.existsSync(configFile)) return {};
  return readJson(configFile);
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

function logProgress(message) {
  console.log(`[opc] ${message}`);
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

module.exports = {
  runWorkItem,
  buildPrompt,
  resolveConfiguredStep,
  staleArtifactsForStep
};
