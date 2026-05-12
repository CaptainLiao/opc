const terminalStatuses = new Set(["done", "blocked"]);

const steps = {
  created: {
    agent: "agent_design",
    prompt: "design",
    requiredArtifact: "spec.md",
    next: "design_done"
  },
  design_done: {
    agent: "agent_code",
    prompt: "code",
    requiredArtifact: "implementation.md",
    next: "code_done"
  },
  code_done: {
    agent: "agent_verify",
    prompt: "verify",
    requiredArtifact: "verify.md",
    resolveNext: resolveVerifyNext
  },
  fixing_code: {
    agent: "agent_code",
    prompt: "code",
    requiredArtifact: "implementation.md",
    next: "code_done",
    maxFixes: 1
  },
  verified: {
    agent: "agent_pr",
    prompt: "pr",
    requiredArtifact: "pr.md",
    next: "done"
  }
};

function getStep(status) {
  return steps[status] || null;
}

function isTerminalStatus(status) {
  return terminalStatuses.has(status);
}

function resolveStepNext(step, context) {
  if (step.resolveNext) return step.resolveNext(context);
  return step.next;
}

function resolveVerifyNext(context) {
  if (context.verifyStatus === "passed") return "verified";
  const fixStep = steps.fixing_code;
  if (context.responsible === fixStep.agent && context.fixCount[fixStep.agent] < fixStep.maxFixes) {
    return "fixing_code";
  }
  return "blocked";
}

module.exports = {
  getStep,
  isTerminalStatus,
  resolveStepNext
};
