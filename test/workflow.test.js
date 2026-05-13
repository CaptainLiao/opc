const test = require("node:test");
const assert = require("node:assert/strict");

const { getStep, isTerminalStatus, resolveStep, resolveStepNext } = require("../lib/workflow");

test("workflow exposes configured steps and terminal statuses", () => {
  assert.equal(getStep("created").agent, "agent_design");
  assert.equal(getStep("verified").requiredArtifact, "pr.md");
  assert.equal(getStep("code_done").variants[0].prompt, "ui-verify");
  assert.equal(getStep("missing"), null);

  assert.equal(isTerminalStatus("done"), true);
  assert.equal(isTerminalStatus("blocked"), true);
  assert.equal(isTerminalStatus("created"), false);
});

test("verify step resolves to normal verify when ui verification is not requested", () => {
  const step = resolveStep(getStep("code_done"), {
    uiVerifyConfigured: false,
    uiVerifyRequested: false
  });

  assert.equal(step.agent, "agent_verify");
  assert.equal(step.prompt, "verify");
});

test("verify step resolves to ui verify when requested and configured", () => {
  const step = resolveStep(getStep("code_done"), {
    uiVerifyConfigured: true,
    uiVerifyRequested: true
  });

  assert.equal(step.agent, "agent_ui_verify");
  assert.equal(step.prompt, "ui-verify");
  assert.equal(step.variant, "browser-ui");
});

test("verify step blocks when ui verification is requested but not configured", () => {
  const step = resolveStep(getStep("code_done"), {
    uiVerifyConfigured: false,
    uiVerifyRequested: true
  });

  assert.equal(step.blockedReason, "uiVerification is required but .opc/config.json has no ui config");
});

test("verify step advances to PR when verification passed", () => {
  const step = getStep("code_done");

  assert.equal(
    resolveStepNext(step, {
      verifyStatus: "passed",
      responsible: null,
      fixCount: { agent_code: 0 }
    }),
    "verified"
  );
});

test("verify step allows one code fix then blocks", () => {
  const step = getStep("code_done");

  assert.equal(
    resolveStepNext(step, {
      verifyStatus: "failed",
      responsible: "agent_code",
      fixCount: { agent_code: 0 }
    }),
    "fixing_code"
  );

  assert.equal(
    resolveStepNext(step, {
      verifyStatus: "failed",
      responsible: "agent_code",
      fixCount: { agent_code: 1 }
    }),
    "blocked"
  );
});

test("verify step blocks non-code failures", () => {
  const step = getStep("code_done");

  assert.equal(
    resolveStepNext(step, {
      verifyStatus: "failed",
      responsible: "environment",
      fixCount: { agent_code: 0 }
    }),
    "blocked"
  );
});
