const path = require("path");

function opcDir(root) {
  return path.join(root, ".opc");
}

function agentsDir(root) {
  return path.join(opcDir(root), "agents");
}

function workItemsDir(root) {
  return path.join(opcDir(root), "work-items");
}

module.exports = {
  agentsDir,
  opcDir,
  workItemsDir
};
