#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { initProject, updateProject } = require("../lib/init");
const { createWorkItem, getWorkItem, listWorkItems, saveWorkItem } = require("../lib/work-items");
const { runWorkItem } = require("../lib/orchestrator");
const { getStep } = require("../lib/workflow");

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "init") {
    initProject(process.cwd());
    console.log("Initialized .opc");
    return;
  }

  if (command === "update") {
    const changes = updateProject(process.cwd());
    console.log("Updated .opc");
    for (const change of changes) {
      console.log(`- ${change}`);
    }
    return;
  }

  if (command === "new") {
    const options = await parseNewArgs(args);
    if (!options.request) throw new Error('Usage: opc new "需求文本" [--draft]\n       opc new --file <path> [--draft]');

    initProject(process.cwd());
    const item = createWorkItem(process.cwd(), options.request);
    console.log(`Created ${item.id}`);

    if (!options.draft) {
      await runWorkItem(process.cwd(), item.id);
    }
    return;
  }

  if (command === "run") {
    const id = args[0];
    if (!id) throw new Error(`Usage: opc ${command} <work-item-id>`);
    await runWorkItem(process.cwd(), id);
    return;
  }

  if (command === "resume") {
    const id = args[0];
    if (!id) throw new Error("Usage: opc resume <work-item-id>");

    const item = getWorkItem(process.cwd(), id);
    const nextStatus = prepareResume(item);
    saveWorkItem(item);
    if (nextStatus) {
      console.log(`${item.state.id} resumed -> ${nextStatus}`);
    }

    await runWorkItem(process.cwd(), id);
    return;
  }

  if (command === "status") {
    const id = args[0];
    if (id) {
      const item = getWorkItem(process.cwd(), id);
      console.log(`${item.state.id} ${item.state.status}`);
      if (item.state.currentStep) console.log(`step: ${item.state.currentStep}`);
      if (item.state.blockedFrom) console.log(`blocked from: ${item.state.blockedFrom}`);
      if (item.state.blockedReason) console.log(`blocked: ${item.state.blockedReason}`);
      return;
    }

    for (const item of listWorkItems(process.cwd())) {
      const blockedFrom = item.state.blockedFrom ? ` from:${item.state.blockedFrom}` : "";
      console.log(`${item.state.id} ${item.state.status}${blockedFrom} ${item.state.slug}`);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function prepareResume(item) {
  let nextStatus = null;

  if (item.state.status === "blocked") {
    nextStatus = item.state.blockedFrom || inferBlockedFrom(item);
    if (!nextStatus) throw new Error("Blocked stage is unknown.");
    if (!getStep(nextStatus)) throw new Error(`Unknown workflow status: ${nextStatus}`);

    item.state.status = nextStatus;
    resetRetryCount(item);
    delete item.state.blockedReason;
    delete item.state.blockedFrom;
  }

  item.state.currentStep = null;
  item.state.activeRun = null;
  return nextStatus;
}

function inferBlockedFrom(item) {
  const activeRunStatus = statusForAgent(item.state.activeRun && item.state.activeRun.agent);
  if (activeRunStatus) return activeRunStatus;

  if (!hasArtifact(item, "spec.md")) return "created";
  if (!hasArtifact(item, "implementation.md")) return "design_done";
  if (!hasArtifact(item, "verify.md")) return "code_done";
  if (!hasArtifact(item, "pr.md")) return verifyPassed(item) ? "verified" : "code_done";
  return "verified";
}

function statusForAgent(agent) {
  return {
    agent_design: "created",
    agent_code: "design_done",
    agent_verify: "code_done",
    agent_ui_verify: "code_done",
    agent_pr: "verified"
  }[agent] || null;
}

function hasArtifact(item, file) {
  const artifact = path.join(item.dir, file);
  return fs.existsSync(artifact) && fs.readFileSync(artifact, "utf8").trim() !== "";
}

function verifyPassed(item) {
  const verifyFile = path.join(item.dir, "verify.md");
  if (!fs.existsSync(verifyFile)) return false;
  return /(^|\n)\s*status:\s*passed\s*($|\n)/i.test(fs.readFileSync(verifyFile, "utf8"));
}

function resetRetryCount(item) {
  if (!item.state.retryCount) return;

  for (const agent of Object.keys(item.state.retryCount)) {
    item.state.retryCount[agent] = 0;
  }
}

async function parseNewArgs(args) {
  let draft = false;
  let file = null;
  const requestParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--draft") {
      draft = true;
    } else if (arg === "--file") {
      file = args[index + 1];
      if (!file) throw new Error("Missing value for --file");
      index += 1;
    } else if (arg.startsWith("--file=")) {
      file = arg.slice("--file=".length);
      if (!file) throw new Error("Missing value for --file");
    } else {
      requestParts.push(arg);
    }
  }

  if (file && requestParts.length > 0) {
    throw new Error("Use either request text or --file, not both");
  }

  let request = "";
  if (file) {
    request = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  } else {
    request = requestParts.join(" ");
  }

  return {
    draft,
    request: request.trim()
  };
}

function printHelp() {
  console.log(`Usage:
  opc init
  opc update
  opc new "需求文本" [--draft]
  opc new --file <path> [--draft]
  opc run <work-item-id>
  opc resume <work-item-id>
  opc status [work-item-id]`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
