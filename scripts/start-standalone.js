/**
 * Production start for Next.js standalone (Timeweb Backend Apps, Docker).
 */
const fs = require("fs");
const path = require("path");
const { findServerJs } = require("./standalone-paths");

if (!process.env.NEXT_CACHE_DIR) {
  process.env.NEXT_CACHE_DIR =
    process.platform === "win32"
      ? path.join(process.cwd(), ".next-cache")
      : "/tmp";
}

if (!process.env.HOSTNAME) {
  process.env.HOSTNAME = "0.0.0.0";
}

const candidates = [];

function addCandidate(base) {
  if (!base) return;
  candidates.push(path.join(base, ".next", "standalone", "server.js"));
  candidates.push(path.join(base, "server.js"));
  const nested = findServerJs(path.join(base, ".next", "standalone"));
  if (nested) candidates.push(nested);
}

addCandidate(process.cwd());
addCandidate(path.join(__dirname, ".."));

const serverPath = [...new Set(candidates)].find((p) => fs.existsSync(p));

if (!serverPath) {
  console.error("[start-standalone] server.js not found. Checked:");
  for (const p of candidates) console.error("  -", p);
  console.error("[start-standalone] cwd:", process.cwd());
  console.error(
    "[start-standalone] Run npm run build first. Timeweb: build = npm run build, start = npm run start, root = repository root."
  );
  process.exit(1);
}

console.log("[start-standalone] PORT=", process.env.PORT || "(default 3000)");
console.log("[start-standalone] HOSTNAME=", process.env.HOSTNAME);
console.log("[start-standalone] loading", serverPath);

require(serverPath);
