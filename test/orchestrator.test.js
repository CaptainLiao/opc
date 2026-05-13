const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { initProject } = require("../lib/init");
const { writeJson } = require("../lib/json-file");
const { createWorkItem } = require("../lib/work-items");
const { getStep } = require("../lib/workflow");
const { buildPrompt, resolveConfiguredStep, staleArtifactsForStep } = require("../lib/orchestrator");

function tempProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opc-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initProject(root);
  return root;
}

test("resolveConfiguredStep keeps normal verify when ui config is absent", (t) => {
  const root = tempProject(t);
  const item = createWorkItem(root, "Check login UI");
  const step = getStep("code_done");

  assert.deepEqual(resolveConfiguredStep(root, item, step), step);
});

test("resolveConfiguredStep blocks when ui is required but config is absent", (t) => {
  const root = tempProject(t);
  const item = createWorkItem(root, "Check login UI");
  item.state.verification.ui = true;

  const step = resolveConfiguredStep(root, item, getStep("code_done"));

  assert.equal(step.blockedReason, "uiVerification is required but .opc/config.json has no ui config");
});

test("resolveConfiguredStep keeps normal verify when ui config exists but work item does not require ui", (t) => {
  const root = tempProject(t);
  writeJson(path.join(root, ".opc", "config.json"), {
    runner: "codex",
    timeoutMs: 1200000,
    ui: {
      baseUrl: "http://localhost:5173",
      startCommands: ["pnpm mock", "pnpm dev"],
      timeoutMs: 60000
    }
  });
  const item = createWorkItem(root, "Update internal parser");

  assert.deepEqual(resolveConfiguredStep(root, item, getStep("code_done")), getStep("code_done"));
});

test("resolveConfiguredStep switches verify to ui verify when work item requires ui", (t) => {
  const root = tempProject(t);
  writeJson(path.join(root, ".opc", "config.json"), {
    runner: "codex",
    timeoutMs: 1200000,
    ui: {
      baseUrl: "http://localhost:5173",
      startCommands: ["pnpm mock", "pnpm dev"],
      timeoutMs: 60000
    }
  });
  const item = createWorkItem(root, "Check login UI");
  item.state.verification.ui = true;

  const step = resolveConfiguredStep(root, item, getStep("code_done"));

  assert.equal(step.agent, "agent_ui_verify");
  assert.equal(step.prompt, "ui-verify");
  assert.equal(step.requiredArtifact, "verify.md");
});

test("resolveConfiguredStep switches verify to ui verify when spec marks ui required", (t) => {
  const root = tempProject(t);
  writeJson(path.join(root, ".opc", "config.json"), {
    runner: "codex",
    ui: {
      baseUrl: "http://localhost:5173"
    }
  });
  const item = createWorkItem(root, "Check login UI");
  fs.writeFileSync(path.join(item.dir, "spec.md"), "uiVerification: required\n");

  const step = resolveConfiguredStep(root, item, getStep("code_done"));

  assert.equal(step.agent, "agent_ui_verify");
  assert.equal(step.prompt, "ui-verify");
});

test("buildPrompt injects ui verification context", (t) => {
  const root = tempProject(t);
  writeJson(path.join(root, ".opc", "config.json"), {
    runner: "codex",
    ui: {
      baseUrl: "http://localhost:5173",
      startCommands: ["pnpm mock", "pnpm dev"],
      timeoutMs: 45000
    }
  });
  const item = createWorkItem(root, "Check login UI");

  const prompt = buildPrompt(root, item, "ui-verify");

  assert.match(prompt, /你是 agent_ui_verify/);
  assert.match(prompt, /baseUrl: http:\/\/localhost:5173/);
  assert.match(prompt, /- pnpm mock/);
  assert.match(prompt, /- pnpm dev/);
  assert.match(prompt, /timeoutMs: 45000/);
  assert.match(prompt, /screenshotsDir: \.opc\/work-items\/FEATURE-\d{8}-001-check-login-ui\/screenshots/);
  assert.match(prompt, /如果存在，读取 .*\/testcases\.md/);
});

test("stale artifact cleanup preserves prior-step inputs", () => {
  assert.deepEqual(staleArtifactsForStep("created", "spec.md"), [
    "spec.md",
    "implementation.md",
    "verify.md",
    "pr.md"
  ]);
  assert.deepEqual(staleArtifactsForStep("design_done", "implementation.md"), [
    "implementation.md",
    "verify.md",
    "pr.md"
  ]);
  assert.deepEqual(staleArtifactsForStep("code_done", "verify.md"), ["verify.md", "pr.md"]);
  assert.deepEqual(staleArtifactsForStep("verified", "pr.md"), ["pr.md"]);
  assert.deepEqual(staleArtifactsForStep("fixing_code", "implementation.md"), ["implementation.md", "pr.md"]);
});
