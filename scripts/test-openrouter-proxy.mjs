import "dotenv/config";
import { config } from "dotenv";
import { fetch as undiciFetch, ProxyAgent } from "undici";

config({ path: ".env.local" });

const key = String(process.env.OPENROUTER_API_KEY ?? "").replace(/\s+/g, "");
if (!key) {
  console.error("No OPENROUTER_API_KEY");
  process.exit(1);
}

function buildProxyUrl() {
  const raw =
    process.env.OPENROUTER_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();
  if (!raw) return null;
  if (raw.includes("@")) return raw;
  const user = process.env.OPENROUTER_PROXY_USER?.trim();
  const pass = process.env.OPENROUTER_PROXY_PASSWORD?.trim();
  if (!user || !pass) return raw.startsWith("http") ? raw : `http://${raw}`;
  const u = new URL(raw.startsWith("http") ? raw : `http://${raw}`);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(pass);
  return u.toString();
}

async function test(label, dispatcher) {
  const r = await undiciFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    ...(dispatcher ? { dispatcher } : {}),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://karto.pro",
      "X-Title": "KARTO OpenRouter test",
    },
    body: JSON.stringify({
      model: "qwen/qwen-2.5-72b-instruct",
      messages: [{ role: "user", content: "Say OK in Russian, one word" }],
      max_tokens: 10,
    }),
  });
  const text = await r.text();
  console.log(`\n[${label}] status=${r.status}`);
  console.log(text.slice(0, 500));
}

const proxyUrl = buildProxyUrl();
await test("direct", undefined);
if (proxyUrl) {
  console.log("proxy:", proxyUrl.replace(/:[^:@/]+@/, ":***@"));
  await test("proxy", new ProxyAgent(proxyUrl));
} else {
  console.log("\nNo proxy configured");
}
