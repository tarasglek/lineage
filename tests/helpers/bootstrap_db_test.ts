Deno.test("bootstrap-db resets a dedicated test db and prints a fresh invite url", async () => {
  const dir = await Deno.makeTempDir();

  try {
    const dataDir = `${dir}/test-data`;
    const dbPath = `${dataDir}/users.sqlite`;
    const logPath = `${dataDir}/bootstrap.log`;
    await Deno.mkdir(dataDir, { recursive: true });
    await Deno.writeTextFile(dbPath, "stale");

    const command = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "/home/taras/smallweb/devices/scripts/bootstrap_db.ts",
        "https://devices.coolness.fyi/",
      ],
      cwd: "/home/taras/smallweb/devices",
      env: {
        DEVICES_DB_PATH: dbPath,
        DEVICES_BOOTSTRAP_LOG_PATH: logPath,
      },
      stdout: "piped",
      stderr: "piped",
    });
    const output = await command.output();
    if (!output.success) {
      throw new Error(new TextDecoder().decode(output.stderr));
    }

    const printed = new TextDecoder().decode(output.stdout).trim();
    if (
      !printed.startsWith("https://devices.coolness.fyi/register?inviteToken=")
    ) {
      throw new Error(`unexpected output: ${printed}`);
    }

    const stat = await Deno.stat(dbPath);
    if (!stat.isFile) throw new Error("expected reset db file");

    const bootstrapLog = await Deno.readTextFile(logPath);
    if (!bootstrapLog.includes("=== bootstrap-db ===")) {
      throw new Error("expected bootstrap log marker");
    }
    if (!bootstrapLog.includes(`dbPath: ${dbPath}`)) {
      throw new Error("expected bootstrap log db path");
    }
    if (!bootstrapLog.includes(`bootstrapLogPath: ${logPath}`)) {
      throw new Error("expected bootstrap log path");
    }
    if (!bootstrapLog.includes("parentPstree:")) {
      throw new Error("expected bootstrap log parent pstree");
    }
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => undefined);
  }
});
