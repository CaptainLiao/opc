const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { agentsDir, opcDir, workItemsDir } = require("./paths");
const { readJson, writeJson } = require("./json-file");
const { version: packageVersion } = require("../package.json");

const currentAgentTemplateVersion = packageVersion;

const readmeUiSection = `## UI verification

UI verification is optional per work item. It only runs when \`.opc/config.json\` has \`ui\` and \`spec.md\` contains:

\`\`\`text
uiVerification: required
\`\`\`

Example config:

\`\`\`json
{
  "ui": {
    "baseUrl": "http://localhost:5173",
    "startCommands": ["pnpm mock", "pnpm dev"],
    "timeoutMs": 60000
  }
}
\`\`\`
`;

const agentTemplates = {
  "design.md": `你是 agent_design，负责把原始需求整理成可执行规格。

输入：
- 当前工作单目录下的 request.md

要求：
- 只分析需求，不修改业务代码。
- 必须在当前工作单目录写入 spec.md。
- 如果本需求需要浏览器 UI 验证，请在 spec.md 中单独一行写入：uiVerification: required
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

# LLM coding guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 错误处理
- 禁止吞掉错误，除非明确说明不显示/处理错误
- 总是在最外层处理错误

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
\`\`\`
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
\`\`\`

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
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
  "ui-verify.md": `你是 agent_ui_verify，负责使用 Playwright 做 UI 验收。

你的目标不是修改代码，而是通过浏览器实际访问页面、执行用户操作、截图取证，并判断实现是否满足规格。

输入：
- 当前工作单目录下的 request.md
- 当前工作单目录下的 spec.md
- 当前工作单目录下的 implementation.md
- 如果存在，读取 testcases.md

OPC 会在提示中提供 UI 配置：
- baseUrl：项目访问入口，不一定是目标页面
- startCommands：本地服务启动命令，可能有多个且需要按顺序执行
- timeoutMs：等待页面可访问的最长时间
- screenshotsDir：截图保存目录

要求：
- 不要修改业务代码。
- 必须使用 Playwright 打开浏览器进行验证。
- 优先使用项目已有的 Playwright 配置和依赖。
- 如果项目没有 Playwright，但当前环境可以使用 Playwright，请把临时验证脚本写到当前工作单目录。
- 如果 Playwright 无法运行，输出 status: failed，responsible: environment。
- baseUrl 只是站点入口，你需要根据需求、规格、实现和项目路由代码推断目标页面路径。
- 如果无法确定页面路径，输出 status: failed，responsible: agent_design。
- 必须至少保存一张关键截图到 screenshotsDir。
- 验证网络请求时，使用 Playwright 的 request/response 监听。
- 验证跳转时，使用 Playwright 的 URL、locator 或 navigation 断言。
- 验证页面状态时，优先使用 locator，不要只依赖截图肉眼判断。
- 完成后必须在当前工作单目录写入 verify.md。

verify.md 第一段必须包含且只能包含以下状态之一：
- status: passed
- status: failed

如果状态是 status: failed，必须在下一行写责任方：
- responsible: agent_code
- responsible: agent_design
- responsible: agent_test_use
- responsible: environment

通过时 verify.md 必须包含：
- # 验收范围
- # 访问路径
- # Playwright 执行情况
- # 证据
- # 风险点

失败时 verify.md 必须包含：
- # 失败用例
- # 预期结果
- # 实际结果
- # Playwright 执行情况
- # 判断依据
- # 证据
- # 建议下一步

责任归因：
- 页面可访问，但行为、请求、跳转、文案或状态不符合规格：agent_code
- 规格缺少页面入口、角色、账号、前置数据，导致无法判断：agent_design
- testcases.md 与 spec.md 冲突：agent_test_use
- Playwright 不可用、服务不可访问、依赖缺失、账号或环境不可用：environment

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
  ensureBaseProject(root);

  let existingAgentFiles = false;
  const installedAgents = {};
  for (const [name, content] of Object.entries(agentTemplates)) {
    const file = path.join(agentsDir(root), name);
    if (fs.existsSync(file)) {
      existingAgentFiles = true;
    } else {
      fs.writeFileSync(file, content);
    }
    installedAgents[name] = manifestAgentEntry(content);
  }

  const manifest = manifestFile(root);
  if (!fs.existsSync(manifest) && !existingAgentFiles) {
    writeJson(manifest, createManifest(installedAgents));
  }
}

function ensureBaseProject(root) {
  fs.mkdirSync(opcDir(root), { recursive: true });
  fs.mkdirSync(agentsDir(root), { recursive: true });
  fs.mkdirSync(workItemsDir(root), { recursive: true });
  ensureGitIgnoreEntry(path.join(root, ".gitignore"), ".opc/work-items/");

  const configFile = path.join(opcDir(root), "config.json");
  if (!fs.existsSync(configFile)) {
    writeJson(configFile, {
      runner: "codex",
      timeoutMs: 1200000
    });
  }

  const readmeFile = path.join(opcDir(root), "README.md");
  if (!fs.existsSync(readmeFile)) {
    fs.writeFileSync(readmeFile, defaultReadme());
  }
}

function defaultReadme() {
  return `# OPC

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
- \`ui-verify.md\`: verifies UI behavior with Playwright when \`config.json\` has \`ui\` and \`spec.md\` contains \`uiVerification: required\`
- \`pr.md\`: writes \`pr.md\`

## work-items/

Generated work items live here and are ignored by Git by default.
`;
}

function updateProject(root) {
  ensureBaseProject(root);

  const changes = [];
  const manifest = readManifest(root);

  for (const [name, content] of Object.entries(agentTemplates)) {
    updateAgentPrompt(root, manifest, changes, name, content);
  }

  const readmeFile = path.join(opcDir(root), "README.md");
  if (appendIfMissing(readmeFile, "## UI verification", `\n${readmeUiSection}`)) {
    changes.push("patched README.md");
  } else {
    changes.push("kept README.md");
  }

  changes.push("skipped config.json");
  writeJson(manifestFile(root), manifest);
  return changes;
}

function updateAgentPrompt(root, manifest, changes, name, template) {
  const file = path.join(agentsDir(root), name);
  const templateEntry = manifestAgentEntry(template);

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, template);
    manifest.agents[name] = templateEntry;
    changes.push(`created agents/${name}`);
    return;
  }

  const current = fs.readFileSync(file, "utf8");
  const currentHash = hashText(current);
  const installedHash = manifest.agents[name] && manifest.agents[name].hash;

  if (currentHash === templateEntry.hash) {
    manifest.agents[name] = templateEntry;
    changes.push(`kept agents/${name}`);
    return;
  }

  if (installedHash && currentHash === installedHash) {
    fs.writeFileSync(file, template);
    manifest.agents[name] = templateEntry;
    changes.push(`updated agents/${name}`);
    return;
  }

  const nextFile = `${file}.new`;
  fs.writeFileSync(nextFile, template);
  changes.push(`created agents/${name}.new`);
}

function readManifest(root) {
  const file = manifestFile(root);
  if (!fs.existsSync(file)) {
    return createManifest({});
  }

  const manifest = readJson(file);
  return {
    agentTemplateVersion: currentAgentTemplateVersion,
    agents: manifest.agents || {}
  };
}

function createManifest(agents) {
  return {
    agentTemplateVersion: currentAgentTemplateVersion,
    agents
  };
}

function manifestAgentEntry(content) {
  return {
    templateVersion: currentAgentTemplateVersion,
    hash: hashText(content)
  };
}

function manifestFile(root) {
  return path.join(opcDir(root), "manifest.json");
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function appendIfMissing(file, marker, content) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current.includes(marker)) return false;
  fs.writeFileSync(file, `${current.replace(/\s*$/, "")}\n${content}`);
  return true;
}

function ensureGitIgnoreEntry(file, entry) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(entry)) return false;

  const next = current.trimEnd();
  fs.writeFileSync(file, `${next}${next ? "\n" : ""}${entry}\n`);
  return true;
}

module.exports = {
  initProject,
  updateProject
};
