const test = require("node:test");
const assert = require("node:assert/strict");

const { getStep, isTerminalStatus, resolveStepNext } = require("../lib/workflow");

test("workflow exposes configured steps and terminal statuses", () => {
  assert.equal(getStep("created").agent, "agent_design");
  assert.equal(getStep("verified").requiredArtifact, "pr.md");
  assert.equal(getStep("missing"), null);

  assert.equal(isTerminalStatus("done"), true);
  assert.equal(isTerminalStatus("blocked"), true);
  assert.equal(isTerminalStatus("created"), false);
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
