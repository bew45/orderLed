import { execSync } from "child_process";

const ports = process.argv.slice(2).map(Number).filter(Boolean);
const projectRoot = process.cwd();

if (ports.length === 0) {
  console.error("Usage: node scripts/kill-port.mjs <port> [port...]");
  process.exit(1);
}

function killWindows(port) {
  let output;
  try {
    output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/LISTENING\s+(\d+)$/);
    if (match) pids.add(match[1]);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
      console.log(`[kill-port] freed port ${port} (killed PID ${pid})`);
    } catch {
      // process may have already exited
    }
  }
}

function killPosix(port) {
  let output;
  try {
    output = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const pid of pids) {
    try {
      execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      console.log(`[kill-port] freed port ${port} (killed PID ${pid})`);
    } catch {
      // process may have already exited
    }
  }
}

// npm/concurrently wrappers on Windows often outlive their child once the child
// dies from a strictPort conflict, so port-based killing alone leaves orphans behind.
// Only target THIS project's long-running dev/serve runtime — never every node process
// that merely runs from this folder (tsc -b, an editor's TS server, ocr:smoke,
// legacy:import, a plain `node` REPL). Killing those was corrupting unrelated work.
const RUNTIME_MARKERS = [
  "concurrently",
  "server/index.ts",
  "server\\index.ts",
  "\\vite\\",
  "/vite/",
  "vite.js",
  "\\tsx\\",
  "/tsx/"
];

function killOrphanedProjectProcessesWindows() {
  const rootLower = projectRoot.toLowerCase();
  const psCommand = [
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\"",
    "| ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }"
  ].join(" ");
  const encoded = Buffer.from(psCommand, "utf16le").toString("base64");

  let output;
  try {
    output = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { encoding: "utf8" });
  } catch {
    return;
  }

  const pids = [];
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("|");
    if (separator === -1) continue;
    const pid = line.slice(0, separator).trim();
    const commandLine = line.slice(separator + 1).toLowerCase();
    if (!pid || Number(pid) === process.pid) continue;
    if (!commandLine.includes(rootLower)) continue;
    if (!RUNTIME_MARKERS.some((marker) => commandLine.includes(marker))) continue;
    pids.push(pid);
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
      console.log(`[kill-port] cleaned up leftover project runtime PID ${pid}`);
    } catch {
      // process may have already exited
    }
  }
}

for (const port of ports) {
  if (process.platform === "win32") killWindows(port);
  else killPosix(port);
}

if (process.platform === "win32") killOrphanedProjectProcessesWindows();
