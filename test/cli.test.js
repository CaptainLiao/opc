const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const cli = path.join(__dirname, "..", "bin", "opc.js");

function tempProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opc-cli-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function runOpc(root, args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    ...options
  });
}

function readOnlyRequest(root) {
  return fs.readFileSync(path.join(onlyWorkItemDir(root), "request.md"), "utf8");
}

function onlyWorkItemDir(root) {
  const base = path.join(root, ".opc", "work-items");
  const names = fs.readdirSync(base);
  assert.equal(names.length, 1);
  return path.join(base, names[0]);
}

function writeOnlyState(root, state) {
  fs.writeFileSync(path.join(onlyWorkItemDir(root), "state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

function readOnlyState(root) {
  return JSON.parse(fs.readFileSync(path.join(onlyWorkItemDir(root), "state.json"), "utf8"));
}

test("opc new accepts requirement text from --file", (t) => {
  const root = tempProject(t);
  fs.writeFileSync(path.join(root, "request.md"), "# Feature\n\n支持长需求文件。\n");

  const result = runOpc(root, ["new", "--file", "request.md", "--draft"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Created FEATURE-\d{8}-001/m);
  assert.equal(readOnlyRequest(root), "# Feature\n\n支持长需求文件。\n");
});

test("opc new rejects mixed request text and --file", (t) => {
  const root = tempProject(t);
  fs.writeFileSync(path.join(root, "request.md"), "from file\n");

  const result = runOpc(root, ["new", "inline", "--file", "request.md", "--draft"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Use either request text or --file, not both/);
});

test("opc status shows the blocked stage", (t) => {
  const root = tempProject(t);
  const created = runOpc(root, ["new", "blocked workflow", "--draft"]);
  assert.equal(created.status, 0, created.stderr);

  const state = readOnlyState(root);
  state.status = "blocked";
  state.blockedFrom = "code_done";
  state.blockedReason = "manual check";
  writeOnlyState(root, state);

  const status = runOpc(root, ["status", state.id]);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, new RegExp(`${state.id} blocked`));
  assert.match(status.stdout, /blocked from: code_done/);
  assert.match(status.stdout, /blocked: manual check/);
});

test("opc resume automatically continues from the saved blocked stage", (t) => {
  const root = tempProject(t);
  const created = runOpc(root, ["new", "resume blocked workflow", "--draft"]);
  assert.equal(created.status, 0, created.stderr);

  const itemDir = onlyWorkItemDir(root);
  fs.writeFileSync(path.join(itemDir, "spec.md"), "uiVerification: required\n");

  const state = readOnlyState(root);
  state.status = "blocked";
  state.blockedFrom = "code_done";
  state.blockedReason = "manual check";
  state.currentStep = "agent_verify";
  state.activeRun = { agent: "agent_verify", status: "failed" };
  state.retryCount.agent_verify = 2;
  state.retryCount.agent_ui_verify = 2;
  writeOnlyState(root, state);

  const result = runOpc(root, ["resume", state.id]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`${state.id} resumed -> code_done`));
  assert.match(result.stdout, new RegExp(`${state.id} blocked`));

  const nextState = readOnlyState(root);
  assert.equal(nextState.status, "blocked");
  assert.equal(nextState.blockedFrom, "code_done");
  assert.equal(nextState.blockedReason, "uiVerification is required but .opc/config.json has no ui config");
  assert.equal(nextState.currentStep, null);
  assert.equal(nextState.activeRun, null);
  assert.equal(nextState.retryCount.agent_verify, 0);
  assert.equal(nextState.retryCount.agent_ui_verify, 0);
});

test("opc resume infers the blocked stage for legacy blocked items", (t) => {
  const root = tempProject(t);
  const created = runOpc(root, ["new", "legacy blocked workflow", "--draft"]);
  assert.equal(created.status, 0, created.stderr);

  const itemDir = onlyWorkItemDir(root);
  fs.writeFileSync(path.join(itemDir, "spec.md"), "uiVerification: required\n");
  fs.writeFileSync(path.join(itemDir, "implementation.md"), "implemented\n");

  const state = readOnlyState(root);
  state.status = "blocked";
  state.blockedReason = "legacy blocked item";
  state.retryCount.agent_verify = 2;
  writeOnlyState(root, state);

  const result = runOpc(root, ["resume", state.id]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`${state.id} resumed -> code_done`));

  const nextState = readOnlyState(root);
  assert.equal(nextState.status, "blocked");
  assert.equal(nextState.blockedFrom, "code_done");
  assert.equal(nextState.retryCount.agent_verify, 0);
});

test("opc resume clears stale active run state after interruption", (t) => {
  const root = tempProject(t);
  const created = runOpc(root, ["new", "interrupted workflow", "--draft"]);
  assert.equal(created.status, 0, created.stderr);

  const itemDir = onlyWorkItemDir(root);
  fs.writeFileSync(path.join(itemDir, "spec.md"), "uiVerification: required\n");
  fs.writeFileSync(path.join(itemDir, "implementation.md"), "implemented\n");

  const state = readOnlyState(root);
  state.status = "code_done";
  state.currentStep = "agent_verify";
  state.activeRun = { agent: "agent_verify", status: "running" };
  writeOnlyState(root, state);

  const result = runOpc(root, ["resume", state.id]);

  assert.equal(result.status, 0, result.stderr);
  const nextState = readOnlyState(root);
  assert.equal(nextState.status, "blocked");
  assert.equal(nextState.currentStep, null);
  assert.equal(nextState.activeRun, null);
  assert.equal(nextState.blockedFrom, "code_done");
});
