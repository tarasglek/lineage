Deno.test("main passkey bootstrap initializes a dedicated test sqlite schema", async () => {
  const dir = await Deno.makeTempDir();

  try {
    const dbPath = `${dir}/users.sqlite`;
    Deno.env.set("DEVICES_DB_PATH", dbPath);
    const { createMainPasskeyApp } = await import("../../main.ts");
    const boot = await createMainPasskeyApp();
    const stat = await Deno.stat(dbPath);
    if (!stat.isFile) throw new Error("expected dedicated test db to be created");
    if (boot.storage.listUsers().length < 1) {
      throw new Error("expected bootstrap to seed at least one user");
    }
    if (boot.storage.listInvites().length < 1) {
      throw new Error("expected bootstrap to seed at least one invite");
    }
    boot.storage.close();
  } finally {
    Deno.env.delete("DEVICES_DB_PATH");
    await Deno.remove(dir, { recursive: true }).catch(() => undefined);
  }
});
