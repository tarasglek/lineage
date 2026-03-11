const baseUrl = Deno.args[0] ?? "http://localhost:8000";
const dbPath = Deno.env.get("DEVICES_DB_PATH") ?? "./data/users.sqlite";
const bootstrapLogPath = Deno.env.get("DEVICES_BOOTSTRAP_LOG_PATH") ?? "./data/bootstrap.log";

async function captureParentProcessTree() {
  try {
    const output = await new Deno.Command("pstree", {
      args: ["-a", "-p", String(Deno.ppid)],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!output.success) {
      return `pstree_failed: ${new TextDecoder().decode(output.stderr).trim()}`;
    }
    return new TextDecoder().decode(output.stdout).trim();
  } catch (error) {
    return `pstree_error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function appendBootstrapLog() {
  const logDir = bootstrapLogPath.includes("/")
    ? bootstrapLogPath.slice(0, bootstrapLogPath.lastIndexOf("/"))
    : ".";
  await Deno.mkdir(logDir, { recursive: true });
  const parentTree = await captureParentProcessTree();
  const entry = [
    "=== bootstrap-db ===",
    `time: ${new Date().toISOString()}`,
    `cwd: ${Deno.cwd()}`,
    `pid: ${Deno.pid}`,
    `ppid: ${Deno.ppid}`,
    `dbPath: ${dbPath}`,
    `bootstrapLogPath: ${bootstrapLogPath}`,
    "parentPstree:",
    parentTree,
    "",
  ].join("\n");
  await Deno.writeTextFile(bootstrapLogPath, entry, { append: true });
}

await appendBootstrapLog();
await Deno.remove(dbPath).catch(() => undefined);

const { createMainPasskeyApp } = await import("../main.ts");
const app = await createMainPasskeyApp(dbPath);
try {
  const url = new URL("/register", baseUrl);
  url.searchParams.set("inviteToken", app.bootstrapInviteToken);
  console.log(url.toString());
} finally {
  app.storage.close();
}
