import {
  createSqlitePasskeyStorage,
  initializePasskeyStorageSqlite,
} from "../../src/passkey_storage_sqlite.ts";

Deno.test("sqlite passkey storage stores and reads users invites credentials and sessions", async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/users.sqlite`;

  await initializePasskeyStorageSqlite(path);
  const storage = createSqlitePasskeyStorage(path);

  storage.putUser({ id: "user-1", username: "alice", invitedBy: "root" });
  storage.putInvite({
    token: "invite-1",
    type: "device",
    inviterUserId: "user-1",
    targetUserId: "user-1",
    label: "alice-phone",
    expiresAt: 123,
    usedAt: null,
  });
  storage.putCredential({
    id: "cred-1",
    publicKey: "pubkey",
    publicKeyPem: "pem",
    algorithm: -7,
    signCount: 5,
    userId: "user-1",
    transports: ["internal", "hybrid"],
  });
  storage.recordSession({ userId: "user-1", createdAt: 456 });

  const user = storage.getUser("user-1");
  if (!user) throw new Error("expected stored user");
  if (user.username !== "alice") throw new Error(`expected alice, got ${user.username}`);
  if (storage.findUserByUsername("alice")?.id !== "user-1") {
    throw new Error("expected username lookup to return user-1");
  }

  const invite = storage.getInvite("invite-1");
  if (!invite) throw new Error("expected stored invite");
  if (invite.type !== "device") throw new Error(`expected device invite, got ${invite.type}`);
  if (invite.targetUserId !== "user-1") throw new Error(`expected target user user-1, got ${invite.targetUserId}`);

  const credential = storage.getCredential("cred-1");
  if (!credential) throw new Error("expected stored credential");
  if ((credential.transports ?? []).join(",") !== "internal,hybrid") {
    throw new Error(`unexpected transports ${(credential.transports ?? []).join(",")}`);
  }

  if (storage.listUsers().length !== 1) throw new Error("expected 1 user");
  if (storage.listInvites().length !== 1) throw new Error("expected 1 invite");
  if (storage.listCredentials().length !== 1) throw new Error("expected 1 credential");
  if (storage.listSessions().length !== 1) throw new Error("expected 1 session");

  storage.close();
});

Deno.test("sqlite passkey storage preserves records after reopening db", async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/users.sqlite`;

  await initializePasskeyStorageSqlite(path);
  {
    const storage = createSqlitePasskeyStorage(path);
    storage.putUser({ id: "user-1", username: "alice", invitedBy: null });
    storage.putInvite({
      token: "invite-1",
      type: "user",
      inviterUserId: "root",
      expiresAt: 999,
      usedAt: 111,
      label: "bootstrap",
    });
    storage.putCredential({
      id: "cred-1",
      publicKey: "pubkey",
      publicKeyPem: "pem",
      algorithm: -7,
      signCount: 7,
      userId: "user-1",
      transports: ["internal"],
    });
    storage.recordSession({ userId: "user-1", createdAt: 222 });
    storage.close();
  }

  {
    const storage = createSqlitePasskeyStorage(path);
    if (storage.getUser("user-1")?.username !== "alice") {
      throw new Error("expected reopened db to contain user");
    }
    if (storage.getInvite("invite-1")?.usedAt !== 111) {
      throw new Error("expected reopened db to contain invite");
    }
    if (storage.getCredential("cred-1")?.signCount !== 7) {
      throw new Error("expected reopened db to contain credential");
    }
    if (storage.listSessions().length !== 1) {
      throw new Error("expected reopened db to contain session");
    }
    storage.close();
  }
});
