/**
 * Finds server.js inside .next/standalone (path varies by OS / outputFileTracingRoot).
 */
const fs = require("fs");
const path = require("path");

function findServerJs(standaloneDir, depth = 0) {
  if (!fs.existsSync(standaloneDir) || depth > 8) return null;

  const direct = path.join(standaloneDir, "server.js");
  if (fs.existsSync(direct)) return direct;

  for (const name of fs.readdirSync(standaloneDir)) {
    const entry = path.join(standaloneDir, name);
    if (!fs.statSync(entry).isDirectory()) continue;
    if (name === "node_modules" || name === ".next") continue;
    const nested = findServerJs(entry, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function getStandaloneAppDir(rootDir) {
  const standaloneRoot = path.join(rootDir, ".next", "standalone");
  const serverPath = findServerJs(standaloneRoot);
  if (!serverPath) return null;
  return {
    standaloneRoot,
    serverPath,
    appDir: path.dirname(serverPath),
  };
}

module.exports = { findServerJs, getStandaloneAppDir };
