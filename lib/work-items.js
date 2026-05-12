const fs = require("fs");
const path = require("path");
const { workItemsDir } = require("./paths");
const { readJson, writeJson } = require("./json-file");

function createWorkItem(root, request) {
  const type = "FEATURE";
  const slug = slugify(request);
  const id = nextId(root, type);
  const dir = path.join(workItemsDir(root), `${id}-${slug}`);

  fs.mkdirSync(path.join(dir, "logs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "screenshots"), { recursive: true });
  fs.writeFileSync(path.join(dir, "request.md"), `${request}\n`);
  fs.writeFileSync(path.join(dir, "README.md"), readme(id, slug, "created"));

  const state = {
    id,
    slug,
    type: "feature",
    status: "created",
    currentStep: null,
    retryCount: {
      agent_design: 0,
      agent_code: 0,
      agent_verify: 0,
      agent_pr: 0
    },
    fixCount: {
      agent_code: 0
    },
    artifacts: {
      request: "request.md",
      spec: "spec.md",
      implementation: "implementation.md",
      verify: "verify.md",
      pr: "pr.md"
    }
  };

  writeJson(path.join(dir, "state.json"), state);
  return { id, dir, state };
}

function getWorkItem(root, id) {
  const dir = findWorkItemDir(root, id);
  return {
    dir,
    state: readJson(path.join(dir, "state.json"))
  };
}

function saveWorkItem(item) {
  writeJson(path.join(item.dir, "state.json"), item.state);
  fs.writeFileSync(path.join(item.dir, "README.md"), readme(item.state.id, item.state.slug, item.state.status));
}

function listWorkItems(root) {
  const base = workItemsDir(root);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => getWorkItem(root, entry.name));
}

function findWorkItemDir(root, id) {
  const base = workItemsDir(root);
  const exact = path.join(base, id);
  if (fs.existsSync(exact)) return exact;

  const match = fs.readdirSync(base).find((name) => name === id || name.startsWith(`${id}-`));
  if (!match) throw new Error(`Work item not found: ${id}`);
  return path.join(base, match);
}

function nextId(root, type) {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const prefix = `${type}-${yyyy}${mm}${dd}`;
  const base = workItemsDir(root);
  const count = fs.existsSync(base) ? fs.readdirSync(base).filter((name) => name.startsWith(prefix)).length : 0;
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

function slugify(text) {
  const ascii = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return ascii || "work-item";
}

function readme(id, slug, status) {
  return `# ${id} ${slug}

## 当前状态

${status}

## 关键产物

- 原始需求：request.md
- 需求规格：spec.md
- 实现摘要：implementation.md
- 验收报告：verify.md
- PR 描述：pr.md
`;
}

module.exports = {
  createWorkItem,
  getWorkItem,
  listWorkItems,
  saveWorkItem
};
