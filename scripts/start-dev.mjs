// Starts the development environment: database, backend (API) and frontend.
//
//   npm run dev
//
// 1. Database: uses the one from DATABASE_URL if it is reachable; otherwise starts the Docker
//    container (docker compose) or, on Windows without Docker, a local PostgreSQL service.
// 2. Installs missing dependencies and applies pending migrations (never resets data).
// 3. Runs backend and frontend with prefixed output. Ctrl+C stops both.
//
// What it started is noted in .dev-state.json, so `npm run stop-dev` stops the database only if
// this script started it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const windows = process.platform === "win32";

const colors = { db: 35, backend: 36, frontend: 32, dev: 33 };
function log(name, text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim()) console.log(`\x1b[${colors[name] ?? 37}m[${name}]\x1b[0m ${line}`);
  }
}
function fail(text) {
  log("dev", `\x1b[31m${text}\x1b[0m`);
  process.exit(1);
}

// npm and npx are .cmd files on Windows and need a shell there; the commands are fixed strings.
const commandLine = (command, args) => [command, ...args].join(" ");

/** Runs a command to completion; returns true on exit code 0. */
function run(command, args, cwd, { quiet = false } = {}) {
  const result = spawnSync(commandLine(command, args), {
    cwd,
    shell: true,
    stdio: quiet ? "pipe" : "inherit",
    encoding: "utf8",
  });
  return result.status === 0;
}

function reachable(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function waitFor(host, port, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await reachable(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

// ---- configuration
const envFile = path.join(backend, ".env");
if (!existsSync(envFile)) {
  fail("backend/.env is missing. Copy backend/.env.example to backend/.env and adjust it.");
}
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^\s*[A-Z_]+\s*=/.test(line))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"(.*)"$/, "$1")];
    })
);
if (!env.DATABASE_URL) fail("DATABASE_URL is missing in backend/.env.");
const database = new URL(env.DATABASE_URL);
const dbHost = database.hostname === "localhost" ? "127.0.0.1" : database.hostname;
const dbPort = Number(database.port || 5432);
const apiPort = Number(env.PORT || 3001);

// ---- 1. database
const stateFile = path.join(root, ".dev-state.json");
let previous = {};
try {
  previous = JSON.parse(readFileSync(stateFile, "utf8"));
} catch {
  // No earlier run.
}
// "docker" or "service:<name>" when this script started the database, "external" otherwise.
let startedDb = "external";
if (await reachable(dbHost, dbPort)) {
  log("db", `PostgreSQL is running on ${dbHost}:${dbPort}.`);
  // Still running from an earlier `npm run dev`: stop-dev may stop it later.
  if (previous.db && previous.db !== "external") startedDb = previous.db;
} else if (run("docker", ["--version"], root, { quiet: true })) {
  log("db", "Starting the PostgreSQL container (docker compose up -d db) …");
  if (!run("docker", ["compose", "up", "-d", "db"], root)) fail("docker compose up failed.");
  if (!(await waitFor(dbHost, dbPort, 60))) fail("The database container did not come up within 60 s.");
  startedDb = "docker";
  log("db", "PostgreSQL is running.");
} else if (windows) {
  const query = spawnSync("sc", ["query", "state=", "all"], { encoding: "utf8" });
  const services = [...(query.stdout ?? "").matchAll(/SERVICE_NAME:\s*(postgresql\S*)/gi)].map((m) => m[1]);
  if (services.length === 0) {
    fail(`No database on ${dbHost}:${dbPort}, no Docker and no PostgreSQL service found. See README "Setup".`);
  }
  log("db", `Starting the Windows service ${services[0]} …`);
  if (!run("net", ["start", services[0]], root)) {
    fail(`Could not start ${services[0]} (starting services may need an administrator terminal).`);
  }
  if (!(await waitFor(dbHost, dbPort, 30))) fail("PostgreSQL did not come up within 30 s.");
  startedDb = `service:${services[0]}`;
  log("db", "PostgreSQL is running.");
} else {
  fail(`No database on ${dbHost}:${dbPort} and no Docker found. Start PostgreSQL and try again.`);
}

writeFileSync(stateFile, `${JSON.stringify({ pid: process.pid, db: startedDb }, null, 2)}
`);

// ---- 2. dependencies and migrations
for (const [name, dir] of [
  ["backend", backend],
  ["frontend", frontend],
]) {
  if (!existsSync(path.join(dir, "node_modules"))) {
    log(name, "Installing dependencies (npm install) …");
    if (!run("npm", ["install"], dir)) fail(`npm install failed in ${name}.`);
  }
}
log("db", "Applying pending migrations (prisma migrate deploy) …");
if (!run("npx", ["prisma", "migrate", "deploy"], backend)) fail("prisma migrate deploy failed.");

// ---- 3. backend and frontend
const children = [];
function start(name, dir) {
  const child = spawn(commandLine("npm", ["run", "dev"]), { cwd: dir, shell: true, env: process.env });
  child.stdout.on("data", (data) => log(name, data));
  child.stderr.on("data", (data) => log(name, data));
  child.on("exit", (code) => {
    log(name, `stopped (exit code ${code ?? "signal"}).`);
    stopAll(code ?? 0);
  });
  children.push(child);
}

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // npm runs through a shell on Windows: end the whole process tree.
    if (windows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

if (await reachable("127.0.0.1", apiPort)) {
  log("backend", `Port ${apiPort} is already in use – an API seems to be running; not starting a second one.`);
} else {
  start("backend", backend);
}
start("frontend", frontend);
log("dev", "Frontend: http://localhost:5173 (Vite picks the next free port if it is taken) · API: " +
  `http://localhost:${apiPort} · Ctrl+C stops everything.`);
