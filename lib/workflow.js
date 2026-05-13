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
    guards: [
      {
        when: missingUiVerifyConfig,
        blockedReason: "uiVerification is required but .opc/config.json has no ui config"
      }
    ],
    variants: [
      {
        name: "browser-ui",
        when: shouldUseUiVerify,
        agent: "agent_ui_verify",
        prompt: "ui-verify"
      }
    ],
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

function resolveStep(step, context) {
  if (!step) return null;

  const guard = (step.guards || []).find((candidate) => candidate.when(context));
  if (guard) {
    return {
      ...step,
      blockedReason: guard.blockedReason
    };
  }

  const variant = (step.variants || []).find((candidate) => candidate.when(context));
  if (!variant) return step;

  const { name, when, ...overrides } = variant;
  return {
    ...step,
    ...overrides,
    variant: name
  };
}

function resolveVerifyNext(context) {
  if (context.verifyStatus === "passed") return "verified";
  const fixStep = steps.fixing_code;
  if (context.responsible === fixStep.agent && context.fixCount[fixStep.agent] < fixStep.maxFixes) {
    return "fixing_code";
  }
  return "blocked";
}

function missingUiVerifyConfig(context) {
  return context.uiVerifyRequested && !context.uiVerifyConfigured;
}

function shouldUseUiVerify(context) {
  return context.uiVerifyRequested && context.uiVerifyConfigured;
}

module.exports = {
  getStep,
  isTerminalStatus,
  resolveStep,
  resolveStepNext
};
