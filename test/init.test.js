const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { initProject, updateProject } = require("../lib/init");
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

  for (const name of ["design.md", "code.md", "verify.md", "ui-verify.md", "pr.md"]) {
    const file = path.join(root, ".opc", "agents", name);
    assert.equal(fs.existsSync(file), true);
    assert.notEqual(fs.readFileSync(file, "utf8").trim(), "");
  }

  assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /^\.opc\/work-items\/$/m);
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

test("initProject preserves gitignore entries and does not duplicate work item ignore", (t) => {
  const root = tempRoot(t);
  const gitignoreFile = path.join(root, ".gitignore");
  fs.writeFileSync(gitignoreFile, "node_modules/\n.opc/work-items/\n");

  initProject(root);
  initProject(root);

  const gitignore = fs.readFileSync(gitignoreFile, "utf8");
  assert.match(gitignore, /^node_modules\/$/m);
  assert.equal(gitignore.match(/^\.opc\/work-items\/$/gm).length, 1);
});

test("updateProject patches missing ui verification support without overwriting local files", (t) => {
  const root = tempRoot(t);
  initProject(root);

  const configFile = path.join(root, ".opc", "config.json");
  const designPrompt = path.join(root, ".opc", "agents", "design.md");
  const uiVerifyPrompt = path.join(root, ".opc", "agents", "ui-verify.md");
  const readmeFile = path.join(root, ".opc", "README.md");

  fs.writeFileSync(configFile, '{\n  "runner": "custom"\n}\n');
  fs.writeFileSync(designPrompt, "custom design prompt\n");
  fs.rmSync(uiVerifyPrompt);

  const changes = updateProject(root);

  assert.deepEqual(readJson(configFile), { runner: "custom" });
  assert.equal(fs.existsSync(uiVerifyPrompt), true);
  assert.match(fs.readFileSync(designPrompt, "utf8"), /custom design prompt/);
  assert.match(fs.readFileSync(designPrompt, "utf8"), /uiVerification: required/);
  assert.match(fs.readFileSync(readmeFile, "utf8"), /UI verification/);
  assert.equal(changes.includes("patched agents/design.md"), true);
  assert.equal(changes.includes("skipped config.json"), true);
});

test("updateProject is idempotent", (t) => {
  const root = tempRoot(t);
  initProject(root);

  const designPrompt = path.join(root, ".opc", "agents", "design.md");
  const readmeFile = path.join(root, ".opc", "README.md");

  updateProject(root);
  const designAfterFirstUpdate = fs.readFileSync(designPrompt, "utf8");
  const readmeAfterFirstUpdate = fs.readFileSync(readmeFile, "utf8");
  const changes = updateProject(root);

  assert.equal(fs.readFileSync(designPrompt, "utf8"), designAfterFirstUpdate);
  assert.equal(fs.readFileSync(readmeFile, "utf8"), readmeAfterFirstUpdate);
  assert.equal(changes.includes("kept agents/design.md"), true);
  assert.equal(changes.includes("kept README.md"), true);
});
