const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const { initProject, updateProject } = require("../lib/init");
const { readJson } = require("../lib/json-file");
const { version: packageVersion } = require("../package.json");

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
  assert.equal(readJson(path.join(root, ".opc", "manifest.json")).agentTemplateVersion, packageVersion);
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

test("updateProject writes .new for locally edited agent prompts", (t) => {
  const root = tempRoot(t);
  initProject(root);

  const configFile = path.join(root, ".opc", "config.json");
  const designPrompt = path.join(root, ".opc", "agents", "design.md");
  const designPromptNew = path.join(root, ".opc", "agents", "design.md.new");
  const uiVerifyPrompt = path.join(root, ".opc", "agents", "ui-verify.md");
  const readmeFile = path.join(root, ".opc", "README.md");

  fs.writeFileSync(configFile, '{\n  "runner": "custom"\n}\n');
  fs.writeFileSync(designPrompt, "custom design prompt\n");
  fs.rmSync(uiVerifyPrompt);

  const changes = updateProject(root);

  assert.deepEqual(readJson(configFile), { runner: "custom" });
  assert.equal(fs.existsSync(uiVerifyPrompt), true);
  assert.equal(fs.readFileSync(designPrompt, "utf8"), "custom design prompt\n");
  assert.match(fs.readFileSync(designPromptNew, "utf8"), /uiVerification: required/);
  assert.match(fs.readFileSync(readmeFile, "utf8"), /UI verification/);
  assert.equal(changes.includes("created agents/design.md.new"), true);
  assert.equal(changes.includes("created agents/ui-verify.md"), true);
  assert.equal(changes.includes("skipped config.json"), true);
});

test("updateProject updates unchanged agent prompts from manifest hash", (t) => {
  const root = tempRoot(t);
  initProject(root);

  const designPrompt = path.join(root, ".opc", "agents", "design.md");
  const manifestFile = path.join(root, ".opc", "manifest.json");
  const oldTemplate = "old installed design template\n";
  fs.writeFileSync(designPrompt, oldTemplate);
  const manifest = readJson(manifestFile);
  manifest.agents["design.md"] = {
    templateVersion: 0,
    hash: hashText(oldTemplate)
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const changes = updateProject(root);

  assert.match(fs.readFileSync(designPrompt, "utf8"), /你是 agent_design/);
  assert.equal(fs.existsSync(path.join(root, ".opc", "agents", "design.md.new")), false);
  assert.equal(changes.includes("updated agents/design.md"), true);
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

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}
