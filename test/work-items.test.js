const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { initProject } = require("../lib/init");
const { readJson } = require("../lib/json-file");
const { createWorkItem, getWorkItem, listWorkItems, saveWorkItem } = require("../lib/work-items");

function tempProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opc-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initProject(root);
  return root;
}

test("createWorkItem writes the expected directory structure and initial state", (t) => {
  const root = tempProject(t);

  const item = createWorkItem(root, "Add user login!");

  assert.match(item.state.id, /^FEATURE-\d{8}-001$/);
  assert.equal(item.state.slug, "add-user-login");
  assert.equal(path.basename(item.dir), `${item.state.id}-add-user-login`);
  assert.equal(fs.readFileSync(path.join(item.dir, "request.md"), "utf8"), "Add user login!\n");
  assert.equal(fs.existsSync(path.join(item.dir, "logs")), true);
  assert.equal(fs.existsSync(path.join(item.dir, "screenshots")), true);

  const state = readJson(path.join(item.dir, "state.json"));
  assert.equal(state.status, "created");
  assert.equal(state.retryCount.agent_design, 0);
  assert.equal(state.fixCount.agent_code, 0);
  assert.equal(state.retryCount.agent_ui_verify, 0);
  assert.deepEqual(state.verification, { ui: false });
});

test("createWorkItem increments IDs with the same date prefix", (t) => {
  const root = tempProject(t);

  const first = createWorkItem(root, "first");
  const second = createWorkItem(root, "second");

  assert.match(first.state.id, /^FEATURE-\d{8}-001$/);
  assert.equal(second.state.id, first.state.id.replace(/001$/, "002"));
});

test("createWorkItem falls back to a generic slug when request has no ASCII words", (t) => {
  const root = tempProject(t);

  const item = createWorkItem(root, "修复登录");

  assert.equal(item.state.slug, "work-item");
  assert.equal(path.basename(item.dir), `${item.state.id}-work-item`);
});

test("get, list, and save work items round-trip state by ID prefix", (t) => {
  const root = tempProject(t);
  const created = createWorkItem(root, "Round trip state");

  const loaded = getWorkItem(root, created.state.id);
  loaded.state.status = "blocked";
  loaded.state.blockedReason = "manual check";
  saveWorkItem(loaded);

  const byBareId = getWorkItem(root, created.state.id);
  assert.equal(byBareId.state.status, "blocked");
  assert.equal(byBareId.state.blockedReason, "manual check");
  assert.match(fs.readFileSync(path.join(byBareId.dir, "README.md"), "utf8"), /blocked/);

  const listed = listWorkItems(root);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].state.id, created.state.id);
});
