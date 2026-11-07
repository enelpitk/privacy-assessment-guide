// Railway start command: apply versioned migrations, optionally run the explicit user seed once,
// then start Next.js on $PORT. Never prints connection strings.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const hide = (s) => String(s ?? "").replace(/postgres(ql)?:\/\/[^\s'"]+/gi, "[database url hidden]");

function runNode(label, script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: process.env });
  const out = hide(`${r.stdout ?? ""}${r.stderr ?? ""}`).trim();
  if (out) console.log(out);
  if (r.status !== 0) console.error(`[start] ${label} failed (exit ${r.status}). The app will start so the problem is visible in the browser.`);
  return r.status === 0;
}

if (!process.env.DATABASE_URL) {
  console.warn("[start] DATABASE_URL is not set. Skipping migrations. Pages will show a configuration message.");
} else {
  const prismaBin = path.join(path.dirname(require.resolve("prisma/package.json")), "build", "index.js");
  console.log("[start] Applying database migrations (prisma migrate deploy)...");
  const migrated = runNode("Migration", prismaBin, ["migrate", "deploy"]);
  if (migrated && process.env.RUN_SEED_USERS === "true") {
    console.log("[start] RUN_SEED_USERS=true: upserting fictional demo users and departments (remove the variable afterwards).");
    runNode("Seed", path.join(process.cwd(), "prisma", "seed.mjs"), []);
  }
}

const nextBin = path.join(path.dirname(require.resolve("next/package.json")), "dist", "bin", "next");
const port = process.env.PORT || "3000";
const child = spawn(process.execPath, [nextBin, "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit", env: process.env });
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
