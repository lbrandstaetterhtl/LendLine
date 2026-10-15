// Stops the development environment started with `npm run dev`.
//
//   npm run stop-dev                 everything below
//   npm run stop-dev -- --script-only  only the processes of `npm run dev` (and what it started)
//   npm run stop-dev -- --keep-db    leave the database running
//   npm run stop-dev -- --dry-run    only show what would be stopped
//
// 1. Running `npm run dev` processes with their API and frontend.
// 2. Other LendLine dev servers of this repository (Vite, tsx), e.g. started by hand.
// 3. The database, but only if `npm run dev` started it (noted in .dev-state.json); a database
//    that was already running before stays untouched.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const scriptOnly = args.has("--script-only");
const keepDb = args.has("--keep-db");

function log(text) {
  console.log(`\x1b[33m[stop-dev]\x1b[0m ${text}`);
}

/** All node processes as { pid, ppid, command }. */
function processes() {
  if (windows) {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8" }
    );
    const parsed = JSON.parse(result.stdout.trim() || "[]");
    return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
      pid: item.ProcessId,
      ppid: item.ParentProcessId,
      command: item.CommandLine ?? "",
    }));
  }
  const result = spawnSync("ps", ["-eo", "pid=,ppid=,args="], { encoding: "utf8" });
  return result.stdout
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }))
    .filter((item) => /\bnode\b/.test(item.command));
}

const normalize = (text) => (windows ? text.replaceAll("\\", "/").toLowerCase() : text);
const repo = normalize(root);
const all = processes().filter((item) => item.pid !== process.pid);

let state = {};
try {
  state = JSON.parse(readFileSync(path.join(root, ".dev-state.json"), "utf8"));
} catch {
  // npm run dev never ran here, or stop-dev cleaned up already.
}

// `node scripts/start-dev.mjs` carries no absolute path; the recorded PID confirms it is this
// repository's when several checkouts exist.
const devRuns = all.filter(
  (item) => /scripts[/\\]start-dev\.mjs/.test(item.command) || item.pid === state.pid
);
const servers = scriptOnly
  ? []
  : all.filter((item) => {
      const command = normalize(item.command);
      return (
        command.includes(repo) &&
        (/\/frontend\/node_modules\/.*vite\/bin\/vite\.js/.test(command) ||
          /\/backend\/node_modules\/tsx\//.test(command))
      );
    });

// A server inside a dev run's tree goes with it.
const children = new Map();
for (const item of all) children.set(item.ppid, [...(children.get(item.ppid) ?? []), item.pid]);
function tree(pid, into = new Set()) {
  into.add(pid);
  for (const child of children.get(pid) ?? []) tree(child, into);
  return into;
}
const covered = new Set(devRuns.flatMap((item) => [...tree(item.pid)]));
const targets = [
  ...devRuns.map((item) => ({ ...item, kind: "npm run dev" })),
  ...servers.filter((item) => !covered.has(item.pid)).map((item) => ({ ...item, kind: "dev server" })),
].filter((item, index, list) => list.findIndex((other) => other.pid === item.pid) === index);

function describe(command) {
  if (/start-dev\.mjs/.test(command)) return "npm run dev";
  if (/vite/.test(command)) return "frontend (Vite)";
  if (/tsx/.test(command)) return "backend (tsx)";
  return command.slice(0, 80);
}

function kill(pid) {
  if (windows) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  for (const member of [...tree(pid)].reverse()) {
    try {
      process.kill(member, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

// ---- processes
if (targets.length === 0) {
  log("No LendLine dev processes are running.");
} else {
  for (const item of targets) {
    log(`${dryRun ? "Would stop" : "Stopping"} ${describe(item.command)} (PID ${item.pid}, ${item.kind}).`);
    if (!dryRun) kill(item.pid);
  }
}

// ---- database
const db = state.db ?? "external";
if (keepDb) {
  log("Database left running (--keep-db).");
} else if (db === "docker") {
  log(`${dryRun ? "Would stop" : "Stopping"} the PostgreSQL container (docker compose stop db).`);
  if (!dryRun) spawnSync("docker", ["compose", "stop", "db"], { cwd: root, stdio: "inherit", shell: windows });
} else if (db.startsWith("service:")) {
  const service = db.slice("service:".length);
  log(`${dryRun ? "Would stop" : "Stopping"} the Windows service ${service}.`);
  if (!dryRun) {
    const result = spawnSync("net", ["stop", service], { stdio: "inherit" });
    if (result.status !== 0) log(`Could not stop ${service} (stopping services may need an administrator terminal).`);
  }
} else {
  log("Database left running: it was not started by npm run dev.");
}

if (!dryRun && !keepDb && existsSync(path.join(root, ".dev-state.json"))) {
  rmSync(path.join(root, ".dev-state.json"));
}
