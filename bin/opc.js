#!/usr/bin/env node

const { initProject } = require("../lib/init");
const { createWorkItem, getWorkItem, listWorkItems } = require("../lib/work-items");
const { runWorkItem } = require("../lib/orchestrator");

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

  if (command === "new") {
    const draft = args.includes("--draft");
    const request = args.filter((arg) => arg !== "--draft").join(" ").trim();
    if (!request) throw new Error('Usage: opc new "需求文本"');

    initProject(process.cwd());
    const item = createWorkItem(process.cwd(), request);
    console.log(`Created ${item.id}`);

    if (!draft) {
      await runWorkItem(process.cwd(), item.id);
    }
    return;
  }

  if (command === "run" || command === "resume") {
    const id = args[0];
    if (!id) throw new Error(`Usage: opc ${command} <work-item-id>`);
    await runWorkItem(process.cwd(), id);
    return;
  }

  if (command === "status") {
    const id = args[0];
    if (id) {
      const item = getWorkItem(process.cwd(), id);
      console.log(`${item.state.id} ${item.state.status}`);
      if (item.state.currentStep) console.log(`step: ${item.state.currentStep}`);
      if (item.state.blockedReason) console.log(`blocked: ${item.state.blockedReason}`);
      return;
    }

    for (const item of listWorkItems(process.cwd())) {
      console.log(`${item.state.id} ${item.state.status} ${item.state.slug}`);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function printHelp() {
  console.log(`Usage:
  opc init
  opc new "需求文本" [--draft]
  opc run <work-item-id>
  opc resume <work-item-id>
  opc status [work-item-id]`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
