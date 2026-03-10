import { runRegisterResponse } from "./passkey_helper_cli.ts";
import { createPasskeyApp } from "../../src/passkey_app.ts";
import {
  createSqlitePasskeyStorage,
  initializePasskeyStorageSqlite,
} from "../../src/passkey_storage_sqlite.ts";

export async function createTestApp() {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/users.sqlite`;
  await initializePasskeyStorageSqlite(path);
  const storage = createSqlitePasskeyStorage(path);

  const providerRootUserId = crypto.randomUUID();
  storage.putUser({
    id: providerRootUserId,
    username: "provider-root",
    invitedBy: null,
  });

  const app = createPasskeyApp(storage);
  const bootstrapInviteToken = crypto.randomUUID();
  storage.putInvite({
    token: bootstrapInviteToken,
    type: "user",
    inviterUserId: providerRootUserId,
    expiresAt: Date.now() + 60_000,
    usedAt: null,
    label: "bootstrap-user",
  });

  return {
    providerRootUserId,
    bootstrapInviteToken,
    app,
    db: {
      path,
      async close() {
        storage.close();
        await Deno.remove(path).catch(() => undefined);
        await Deno.remove(dir).catch(() => undefined);
      },
    },
    storage,
    getUser(userId: string) {
      return storage.getUser(userId);
    },
    putUser(user: { id: string; username: string; invitedBy?: string | null }) {
      storage.putUser(user);
    },
    listUsers() {
      return storage.listUsers();
    },
    getInvite(token: string) {
      return storage.getInvite(token);
    },
    putInvite(invite: {
      token: string;
      type: "user" | "device";
      inviterUserId: string | null;
      targetUserId?: string;
      label?: string;
      expiresAt: number;
      usedAt: number | null;
    }) {
      storage.putInvite(invite);
    },
    listInvites() {
      return storage.listInvites();
    },
    getCredential(id: string) {
      return storage.getCredential(id);
    },
    putCredential(credential: {
      id: string;
      publicKey: string;
      publicKeyPem?: string;
      algorithm: number;
      signCount: number;
      userId: string;
      transports?: string[];
    }) {
      storage.putCredential(credential);
    },
    listCredentials() {
      return storage.listCredentials();
    },
    listSessions() {
      return storage.listSessions();
    },
    seedInvite(overrides?: {
      type?: "user" | "device";
      inviterUserId?: string | null;
      targetUserId?: string;
      label?: string;
      expiresAt?: number;
      usedAt?: number | null;
    }) {
      const token = crypto.randomUUID();
      storage.putInvite({
        token,
        type: overrides?.type ?? "user",
        inviterUserId: overrides?.inviterUserId ?? providerRootUserId,
        targetUserId: overrides?.targetUserId,
        label: overrides?.label,
        expiresAt: overrides?.expiresAt ?? Date.now() + 60_000,
        usedAt: overrides?.usedAt ?? null,
      });
      return token;
    },
    async seedUserWithPasskey(username: string) {
      const userId = crypto.randomUUID();
      storage.putUser({ id: userId, username });

      const creationOptions = {
        challenge: "seed-challenge",
        rp: { id: "localhost", name: "Lineage invite-network" },
        user: { id: userId, name: username, displayName: username },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      };
      const generated = await runRegisterResponse({
        origin: "http://localhost",
        creationOptions,
      });
      const credential = {
        id: generated.credential.id,
        publicKey: generated.credential.publicKey,
        publicKeyPem: generated.credential.publicKeyPem,
        privateKeyPem: generated.credential.privateKeyPem,
        rpId: generated.credential.rpId,
        algorithm: generated.credential.algorithm,
        signCount: generated.credential.signCount,
        userId,
        transports: ["internal"],
      };
      storage.putCredential(credential);

      return {
        username,
        userId,
        credential,
      };
    },
  };
}
