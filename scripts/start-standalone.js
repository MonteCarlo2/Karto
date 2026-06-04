/**
 * Production start for Next.js standalone (Timeweb Backend Apps, Docker).
 * Prefers build-generated .next/standalone/start.js (self-contained, keeps process in foreground).
 */
const fs = require("fs");
const path = require("path");
const { findServerJs } = require("./standalone-paths");

const repoRoot = path.join(__dirname, "..");
const generatedStart = path.join(repoRoot, ".next", "standalone", "start.js");

if (fs.existsSync(generatedStart)) {
  require(generatedStart);
  return;
}

if (!process.env.NEXT_CACHE_DIR) {
  process.env.NEXT_CACHE_DIR =
    process.platform === "win32"
      ? path.join(process.cwd(), ".next-cache")
      : "/tmp";
}

if (!process.env.HOSTNAME) {
  process.env.HOSTNAME = "0.0.0.0";
}

function linkWritableNextCache(appDir) {
  if (process.platform === "win32") return;
  const cacheBase = process.env.NEXT_CACHE_DIR;
  const writable = path.join(cacheBase, "karto-next-prerender-cache");
  const nextDir = path.join(appDir, ".next");
  const cachePath = path.join(nextDir, "cache");
  try {
    fs.mkdirSync(writable, { recursive: true });
    fs.mkdirSync(nextDir, { recursive: true });
    if (fs.existsSync(cachePath)) {
      const st = fs.lstatSync(cachePath);
      if (st.isSymbolicLink()) return;
      if (st.isDirectory()) {
        try {
          fs.rmSync(cachePath, { recursive: true, force: true });
        } catch {
          return;
        }
      }
    }
    fs.symlinkSync(writable, cachePath, "dir");
  } catch (e) {
    console.warn("[start-standalone] prerender cache symlink:", e instanceof Error ? e.message : e);
  }
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
addCandidate(repoRoot);

const serverPath = [...new Set(candidates)].find((p) => fs.existsSync(p));

if (!serverPath) {
  console.error("[start-standalone] server.js not found. Checked:");
  for (const p of candidates) console.error("  -", p);
  console.error("[start-standalone] cwd:", process.cwd());
  console.error(
    "[start-standalone] Run npm run build first. Timeweb: build = npm run build, start = node .next/standalone/start.js"
  );
  process.exit(1);
}

console.log("[start-standalone] PORT=", process.env.PORT || "(default 3000)");
console.log("[start-standalone] HOSTNAME=", process.env.HOSTNAME);
console.log("[start-standalone] loading", serverPath);

linkWritableNextCache(path.dirname(serverPath));
require(serverPath);
