const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { initProject } = require("../lib/init");
const { readJson } = require("../lib/json-file");

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opc-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("initProject creates config, agent prompts, and work item directory", (t) => {
  const root = tempRoot(t);

  initProject(root);

  assert.deepEqual(readJson(path.join(root, ".opc", "config.json")), {
    runner: "codex",
    timeoutMs: 1200000
  });
  assert.equal(fs.existsSync(path.join(root, ".opc", "work-items")), true);

  for (const name of ["design.md", "code.md", "verify.md", "pr.md"]) {
    const file = path.join(root, ".opc", "agents", name);
    assert.equal(fs.existsSync(file), true);
    assert.notEqual(fs.readFileSync(file, "utf8").trim(), "");
  }
});

test("initProject keeps existing local configuration and prompts", (t) => {
  const root = tempRoot(t);
  initProject(root);

  const configFile = path.join(root, ".opc", "config.json");
  const designPrompt = path.join(root, ".opc", "agents", "design.md");
  fs.writeFileSync(configFile, '{\n  "runner": "custom"\n}\n');
  fs.writeFileSync(designPrompt, "custom design prompt\n");

  initProject(root);

  assert.deepEqual(readJson(configFile), { runner: "custom" });
  assert.equal(fs.readFileSync(designPrompt, "utf8"), "custom design prompt\n");
});
