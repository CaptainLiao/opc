const fs = require("fs");
const path = require("path");
const { agentsDir, opcDir, workItemsDir } = require("./paths");
const { writeJson } = require("./json-file");

const agentTemplates = {
  "design.md": `你是 agent_design，负责把原始需求整理成可执行规格。

输入：
- 当前工作单目录下的 request.md

要求：
- 只分析需求，不修改业务代码。
- 必须在当前工作单目录写入 spec.md。
- spec.md 必须包含以下章节：
  - # 背景
  - # 目标
  - # 非目标
  - # 涉及模块
  - # 技术方案
  - # 验收标准
  - # 风险点

输出：
- spec.md
`,
  "code.md": `你是 agent_code。

输入：
- 当前工作单目录下的 request.md
- 当前工作单目录下的 spec.md

要求：
- 根据 spec.md 实现需求。
- 遵守项目现有风格。
- 如果当前流程状态是 fixing_code，必须读取 verify.md，只修复验收失败指出的问题，不要扩大范围。
- 不要修改 OPC 的过程产物，除了当前工作单目录下的 implementation.md。
- 完成后必须在当前工作单目录写入 implementation.md。
- implementation.md 必须包含以下章节：
  - # 实现摘要
  - # 变更文件
  - # 自测情况
  - # 风险点

输出：
- implementation.md
`,
  "verify.md": `你是 agent_verify。

输入：
- 当前工作单目录下的 request.md
- 当前工作单目录下的 spec.md
- 当前工作单目录下的 implementation.md

要求：
- 根据 spec.md 验收当前实现。
- 不要修改业务代码。
- 只写当前工作单目录下的 verify.md。
- verify.md 第一段必须包含且只能包含以下状态之一：
  - status: passed
  - status: failed
- 如果状态是 status: failed，必须在下一行写责任方：
  - responsible: agent_code
  - responsible: agent_design
  - responsible: environment
- 如果失败，必须说明失败用例、预期结果、实际结果、判断依据。

输出：
- verify.md
`,
  "pr.md": `你是 agent_pr。

输入：
- 当前工作单目录下的 request.md
- 当前工作单目录下的 spec.md
- 当前工作单目录下的 implementation.md
- 当前工作单目录下的 verify.md
- 当前 git diff

要求：
- 根据输入生成 PR 描述。
- 必须在当前工作单目录写入 pr.md。
- pr.md 必须包含以下章节：
  - ## 背景
  - ## 变更内容
  - ## 测试结果
  - ## 风险点

输出：
- pr.md

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
      runner: "codex",
      timeoutMs: 1200000
    });
  }

  const readmeFile = path.join(opcDir(root), "README.md");
  if (!fs.existsSync(readmeFile)) {
    fs.writeFileSync(
      readmeFile,
      `# OPC

OPC stores project-local agent rules and work item state here.

## config.json

\`runner\` chooses which local agent command OPC calls.

Default:

\`\`\`json
{
  "runner": "codex",
  "timeoutMs": 1200000
}
\`\`\`

\`timeoutMs\` is the maximum time a single Agent run may take before OPC stops it and retries.

The agent prompts use the fixed files in \`.opc/agents/\`.

## agents/

- \`design.md\`: turns the request into \`spec.md\`
- \`code.md\`: implements the spec
- \`verify.md\`: writes \`verify.md\`
- \`pr.md\`: writes \`pr.md\`

## work-items/

Generated work items live here and are ignored by Git by default.
`
    );
  }

  for (const [name, content] of Object.entries(agentTemplates)) {
    const file = path.join(agentsDir(root), name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, content);
  }
}

module.exports = {
  initProject
};
