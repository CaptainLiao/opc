const fs = require("fs");
const path = require("path");
const { agentsDir, opcDir, workItemsDir } = require("./paths");
const { writeJson } = require("./json-file");

const agentTemplates = {
  "design.md": `你是 agent_design。
你只负责把原始需求整理成 spec.md。
不要修改业务代码。
`,
  "code.md": `你是 agent_code。
你负责根据 spec.md 修改代码。
遵守项目现有风格。
`,
  "verify.md": `你是 agent_verify。
你负责根据 spec.md 验收当前实现。
不要修业务代码，只写 verify.md。
`,
  "pr.md": `你是 agent_pr。
你负责根据 request.md、spec.md、verify.md 和当前 diff 生成 pr.md。
不要提交代码，不要创建远程 PR。
`
};

function initProject(root) {
  fs.mkdirSync(opcDir(root), { recursive: true });
  fs.mkdirSync(agentsDir(root), { recursive: true });
  fs.mkdirSync(workItemsDir(root), { recursive: true });

  const configFile = path.join(opcDir(root), "config.json");
  if (!fs.existsSync(configFile)) {
    writeJson(configFile, {
      codexCommand: "codex",
      maxAgentRetries: 1,
      agents: {
        design: { prompt: ".opc/agents/design.md" },
        code: { prompt: ".opc/agents/code.md" },
        verify: { prompt: ".opc/agents/verify.md" },
        pr: { prompt: ".opc/agents/pr.md" }
      }
    });
  }

  for (const [name, content] of Object.entries(agentTemplates)) {
    const file = path.join(agentsDir(root), name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, content);
  }
}

module.exports = {
  initProject
};
