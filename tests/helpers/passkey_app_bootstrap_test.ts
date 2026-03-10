Deno.test("main passkey bootstrap initializes ./data/users.sqlite schema", async () => {
  const originalCwd = Deno.cwd();
  const dir = await Deno.makeTempDir();

  try {
    Deno.chdir(dir);
    const { createMainPasskeyApp } = await import("../../main.ts");
    const boot = await createMainPasskeyApp();
    const stat = await Deno.stat("./data/users.sqlite");
    if (!stat.isFile) throw new Error("expected ./data/users.sqlite to be created");
    if (boot.storage.listUsers().length < 1) {
      throw new Error("expected bootstrap to seed at least one user");
    }
    if (boot.storage.listInvites().length < 1) {
      throw new Error("expected bootstrap to seed at least one invite");
    }
    boot.storage.close();
  } finally {
    Deno.chdir(originalCwd);
    await Deno.remove(dir, { recursive: true }).catch(() => undefined);
  }
});
