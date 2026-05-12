# Symphony: 多 Agent 研发流程编排系统设想

## 定位

Symphony 不是新的代码生成 Agent，而是一个研发任务编排器。

它的目标是把 Codex 这类执行型 Agent 放进一个可控、可恢复、可审计的研发流程里，让一次需求或 Bug 修复从原始描述到 PR 交付形成完整链路。

可以这样理解：

```text
Codex = 智能执行引擎
Symphony = 研发任务生命周期管理器
```

Symphony 重点解决的问题不是“AI 会不会写代码”，而是：

```text
AI 写代码这件事，如何变成稳定、可控、可复盘的研发流程。
```

## 理想产品形态

第一阶段以 CLI 为核心。

CLI 贴近代码仓库、Git、测试命令、构建命令和 PR 流程，最适合作为执行底座。

理想形态可以分成四层：

```text
symphony-core   状态机、任务协议、Agent 调度、产物管理
symphony-cli    命令行入口，负责创建、执行、恢复任务
symphony-web    本地任务面板，负责观察和人工干预
symphony-ide    IDE 插件，作为日常入口
```

推荐演进路线：

```text
第一版：CLI + 文件协议
第二版：CLI + 本地 Web 面板
第三版：IDE 插件
第四版：团队服务端 / 任务队列 / 权限 / 审计
```

## CLI 体验

日常使用不应该强制用户手动 run。

默认体验应该是：

或者：

```bash
symphony new "给订单列表增加批量导出"
```

默认行为：

```text
创建任务 -> 需求分析 -> 实现 -> 测试用例 -> 验收 -> PR
```

仍然保留底层控制命令，用于草稿、恢复、调试、CI 和人工干预：

```bash
symphony init
symphony new "需求文本"
symphony new "需求文本" --draft
symphony new "需求文本" --until design
symphony run FEATURE-20260511-001
symphony resume FEATURE-20260511-001
symphony retry FEATURE-20260511-001 agent_code
symphony status FEATURE-20260511-001
symphony pr FEATURE-20260511-001
```

`run` 不是日常必需入口，而是恢复、调试和 CI 场景下的显式执行能力。

## 核心原则

### 1. Agent 不直接互相通信

不推荐：

```text
agent_design -> agent_code -> agent_test_verify
```

推荐：

```text
agent_design -> 写入产物/result
agent_master -> 读取结果 -> 决定下一步
```

所有状态流转都经过 `agent_master`，这样系统更可控，也更容易恢复和调试。

### 2. 通过工作单和状态协作

每个任务都有独立目录，所有关键产物落盘。

不要只依赖对话上下文推进任务。

### 3. 测试用例独立于实现

`agent_test_use` 应根据需求文档生成测试用例，而不是根据 `agent_code` 的实现结果补测试。

这样可以避免测试迁就实现。

### 4. 验收失败需要归因

失败不应该全部打回 `agent_code`。

需要区分：

```text
需求不清 -> agent_design
实现不符 -> agent_code
测试用例错误 -> agent_test_use
环境问题 -> agent_master / 人工介入
```

## 工作单目录结构

不建议把所有任务都简单放在 `.symphony/tasks/` 下。

`tasks` 这个名字太泛，第一眼看不出里面保存的是一次研发工作的完整过程、交付物和审计记录。

推荐使用 `work-items` 或 `changes` 这类更明确的目录名。这里暂定为 `work-items`，表示“可跟踪的研发工作单”。

第一版不需要复杂阶段目录。每个工作单只保留最关键的几个文件：

```text
.symphony/
  config.json
  agents/
    design.md
    code.md
    test-use.md
    test-verify.md
    pr.md
  work-items/
    FEATURE-20260511-001-order-batch-export/
      README.md
      state.json
      request.md
      spec.md
      testcases.md
      verify.md
      pr.md
      screenshots/
      logs/
        master.log
```

这个结构有几个好处：

- `work-items` 比 `tasks` 更明确，表示这里是研发工作单，而不是普通待办。
- 工作单目录名包含类型、日期、序号和简短主题，列表里就能看懂。
- 文件数量少，新读者能很快理解每个文件的作用。
- `README.md` 作为人类入口，`state.json` 作为机器状态。
- 后续复杂了，再把 `screenshots/`、`logs/` 或阶段目录拆细。

## state.json

`state.json` 是工作单状态核心。

示例：

```json
{
  "id": "FEATURE-20260511-001",
  "slug": "order-batch-export",
  "type": "feature",
  "status": "verifying",
  "currentStep": "agent_test_verify",
  "retryCount": {
    "agent_design": 0,
    "agent_code": 1,
    "agent_test_use": 0,
    "agent_test_verify": 0
  },
  "artifacts": {
    "request": "request.md",
    "spec": "spec.md",
    "testcases": "testcases.md",
    "verify": "verify.md",
    "pr": "pr.md"
  }
}
```

建议记录：

- 工作单 ID
- 可读短名
- 任务类型：feature / bugfix
- 当前状态
- 当前步骤
- 每个 Agent 的重试次数
- 关键产物路径
- 失败原因
- 返工历史
- 是否需要人工介入

## README.md

每个工作单目录下建议有一个 `README.md`，作为人类阅读入口。

它不需要保存所有细节，只做索引和当前状态摘要：

```md
# FEATURE-20260511-001 order-batch-export

## 当前状态

verifying

## 目标

给订单列表增加批量导出。

## 关键产物

- 原始需求：request.md
- 需求规格：spec.md
- 测试用例：testcases.md
- 验收报告：verify.md
- PR 描述：pr.md

## 当前阻塞

无

## 下一步

等待 agent_test_verify 完成验收。
```

## 状态机

第一版可以使用固定状态机，不需要一开始做成复杂工作流引擎。

主流程：

```text
created
  ↓
designing
  ↓
design_done
  ↓
coding_and_testcase_generating
  ↓
implementation_done
  ↓
verifying
  ↓
verified
  ↓
pr_creating
  ↓
done
```

失败与返工：

```text
verify_failed
  ↓
rework_design / rework_code / rework_testcase
  ↓
verifying
```

## Agent 异常处理

子 Agent 出错或挂起时，不应该让整个流程崩掉。

`agent_master` 需要把每次 Agent 调用当成一个可重试的运行节点来处理。

第一版只需要支持几类简单状态：

```text
success    Agent 成功完成，进入下一步
failed     Agent 明确失败，根据原因返工或阻塞
timeout    超过最大执行时间，重试当前 Agent
stalled    长时间无输出或无心跳，终止后重试
invalid    输出格式不符合要求，重试当前 Agent
blocked    超过重试上限，等待人工介入
```

建议每次 Agent 运行时在 `state.json` 中记录当前运行信息：

```json
{
  "activeRun": {
    "agent": "agent_code",
    "runId": "RUN-001",
    "status": "running",
    "startedAt": "2026-05-11T10:00:00+08:00",
    "lastActiveAt": "2026-05-11T10:03:00+08:00",
    "timeoutAt": "2026-05-11T10:20:00+08:00"
  }
}
```

处理规则：

```text
Agent 成功
  -> 校验输出
  -> 更新产物
  -> 进入下一步

Agent 明确失败
  -> 记录失败原因
  -> 能归因则返工
  -> 不能归因则 blocked

Agent 超时或挂起
  -> 归档日志
  -> 重试当前 Agent

Agent 输出无效
  -> 标记 invalid
  -> 重试当前 Agent

重试超过上限
  -> 标记 blocked
  -> 等待人工处理
```

默认每个 Agent 最多自动重试 2 次。

并行执行时，只重试失败的 Agent，保留已经成功的产物。

例如 `agent_code` 失败、`agent_test_use` 成功时，不需要重新生成 `testcases.md`，只重试 `agent_code`。

## Agent 角色

### agent_master

协调者，不直接写代码。

职责：

1. 获取需求或 Bug。
2. 创建工作单目录和 `state.json`。
3. 调用 `agent_design` 生成规格文档。
4. 规格完成后，并行调用 `agent_code` 和 `agent_test_use`。
5. 两者完成后，调用 `agent_test_verify`。
6. 根据验收结果决定通过、返工或人工介入。
7. 验收通过后调用 `agent_pr`。
8. 完成任务并记录最终状态。

### agent_design

需求分析 Agent。

职责：

1. 判断任务是需求还是 Bug。
2. 生成 `spec.md`。
3. 明确范围和验收标准。

建议 `spec.md` 格式：

```md
# 背景

# 目标

# 非目标

# 涉及模块

# 涉及文件

# 用户路径

# 技术方案

# 验收标准

# 风险点

# 回滚方式
```

`非目标` 很重要，用来防止 Agent 扩大范围。

### agent_code

代码实现 Agent。

职责：

1. 根据 `spec.md` 实现需求。
2. 使用项目既有规范和工具。
3. 必要时使用 OpenSpec 或类似机制拆分代码任务。
4. 修复 `agent_test_verify` 打回的问题。
5. 输出实现摘要和变更文件列表。

返工时输入应包括：

```text
spec.md
testcases.md
verify.md
当前 diff
```

### agent_test_use

测试用例 Agent。

职责：

1. 根据 `spec.md` 编写 `testcases.md`。
2. 测试用例应覆盖核心逻辑、边界条件、异常场景和 UI 流程。
3. 第一版测试用例不读取实现结果，避免迁就代码。

### agent_test_verify

测试验收 Agent。

职责：

1. 根据 `testcases.md` 执行验收。
2. 做逻辑验收。
3. 做 UI 验收。
4. 对比 UI 设计稿和实际展示。
5. 通过时保留截图。
6. 失败时输出结构化验收失败报告。

失败报告示例：

```md
# 验收失败报告

## 失败用例

订单列表选择多条记录后，点击批量导出，应下载 xlsx 文件。

## 预期结果

触发导出请求并下载文件。

## 实际结果

按钮保持 disabled。

## 判断依据

Playwright 测试失败，截图见 screenshots/export-failed.png。

## 建议责任方

agent_code

## 是否阻塞 PR

是
```

### agent_pr

合并请求 Agent。

职责：

1. 检查工作区 diff。
2. 汇总变更文件。
3. 生成 PR 标题。
4. 生成 PR 描述。
5. 附带测试结果。
6. 附带 UI 截图。
7. 标记风险点。
8. 关联需求文档或 Bug 文档。
9. 根据项目规则提交代码并创建 PR。

PR 描述建议格式：

```md
## 背景

## 变更内容

## 测试结果

## UI 截图

## 风险点

## 关联文档
```

## 执行流程

```text
用户 / 需求方
  ↓
agent_master 创建任务、分配 task_id
  ↓
agent_design 生成 spec 文档
  ↓
agent_master 审核 spec 完整性
  ↓
并行：
  - agent_code 根据 spec 实现
  - agent_test_use 根据 spec 写测试用例
  ↓
agent_test_verify 根据测试用例验收
  ↓
若失败：
  - 需求问题 -> agent_design
  - 实现问题 -> agent_code
  - 测试问题 -> agent_test_use
  - 环境问题 -> 人工介入
  ↓
验收通过
  ↓
agent_pr 汇总 diff、测试、截图并创建 PR
  ↓
done
```

## 配置文件

项目级配置示例：

```json
{
  "projectName": "webapp",
  "agents": {
    "design": {
      "model": "gpt-5.2",
      "prompt": ".symphony/agents/design.md"
    },
    "code": {
      "model": "gpt-5.3-codex",
      "prompt": ".symphony/agents/code.md"
    },
    "verify": {
      "model": "gpt-5.3-codex",
      "prompt": ".symphony/agents/verify.md"
    }
  },
  "commands": {
    "lint": "pnpm lint",
    "test": "pnpm test",
    "build": "pnpm build"
  }
}
```

## MVP 范围

建议第一版不要做复杂平台，先验证闭环。

第一阶段：

1. 定义 `.symphony/work-items/WORK-ITEM-ID/` 文件协议。
2. 实现 `state.json` 状态机。
3. 支持 `symphony init`。
4. 支持 `symphony new "需求文本"`。
5. 支持默认自动执行。
6. 接入 `agent_design`、`agent_code`、`agent_test_verify`。
7. 生成 `spec.md`、`verify.md`、`pr.md`。
8. 支持失败后打回 `agent_code`，最多重试 2 次。

第二阶段：

1. 增加 `agent_test_use`。
2. 支持 `agent_code` 和 `agent_test_use` 并行。
3. 增加截图和 UI 验收产物。
4. 增加 `status`、`resume`、`retry` 命令。

第三阶段：

1. 增加本地 Web 面板。
2. 支持人工审批和人工修改规格。
3. 支持真实创建 PR。
4. 支持团队任务历史和审计。

## 总结

Symphony 的本质是：

```text
文件协议 + 状态机 + Agent 编排 + 验收返工机制
```

第一版应该尽量朴素：

```text
CLI 入口
工作单目录落盘
固定状态机
结构化 Agent 输出
失败可恢复
验收可返工
PR 可追踪
```

只要这个闭环跑通，后续再加 Web UI、IDE 插件和团队协作能力。
