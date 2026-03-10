Deno.test("bootstrap-db resets db and prints a fresh invite url", async () => {
  const originalCwd = Deno.cwd();
  const dir = await Deno.makeTempDir();

  try {
    Deno.chdir(dir);
    await Deno.mkdir("data", { recursive: true });
    await Deno.writeTextFile("./data/users.sqlite", "stale");

    const command = new Deno.Command(Deno.execPath(), {
      args: ["task", "--cwd", "/home/taras/smallweb/devices", "bootstrap-db", "https://devices.coolness.fyi/"],
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await command.output();
    if (!output.success) {
      throw new Error(new TextDecoder().decode(output.stderr));
    }

    const printed = new TextDecoder().decode(output.stdout).trim();
    if (!printed.startsWith("https://devices.coolness.fyi/register?inviteToken=")) {
      throw new Error(`unexpected output: ${printed}`);
    }

    const stat = await Deno.stat("./data/users.sqlite");
    if (!stat.isFile) throw new Error("expected reset db file");
  } finally {
    Deno.chdir(originalCwd);
    await Deno.remove(dir, { recursive: true }).catch(() => undefined);
  }
});
