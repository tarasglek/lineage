import { createPasskeyApp } from "./src/passkey_app.ts";
import {
  createSqlitePasskeyStorage,
  initializePasskeyStorageSqlite,
} from "./src/passkey_storage_sqlite.ts";

export async function createMainPasskeyApp(path = "./data/users.sqlite") {
  await initializePasskeyStorageSqlite(path);
  const storage = createSqlitePasskeyStorage(path);

  let providerRootUser = storage.findUserByUsername("provider-root");
  if (!providerRootUser) {
    providerRootUser = {
      id: crypto.randomUUID(),
      username: "provider-root",
      invitedBy: null,
    };
    storage.putUser(providerRootUser);
  }

  let bootstrapInvite = storage.listInvites().find((invite) =>
    invite.type === "user" && invite.inviterUserId === providerRootUser!.id &&
    invite.label === "bootstrap-user" && invite.usedAt === null
  );
  if (!bootstrapInvite) {
    bootstrapInvite = {
      token: crypto.randomUUID(),
      type: "user" as const,
      inviterUserId: providerRootUser.id,
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      usedAt: null,
      label: "bootstrap-user",
    };
    storage.putInvite(bootstrapInvite);
  }

  const app = createPasskeyApp(storage);
  return {
    app,
    storage,
    providerRootUserId: providerRootUser.id,
    bootstrapInviteToken: bootstrapInvite.token,
  };
}

const main = await createMainPasskeyApp();

export default main.app;
