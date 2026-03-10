import { runRegisterResponse } from "./passkey_helper_cli.ts";
import { createPasskeyApp } from "../../src/passkey_app.ts";
import { createInMemoryPasskeyStorage, type TestState } from "../../src/passkey_storage.ts";
import { createTestDb } from "./test_db.ts";

export async function createTestApp() {
  const db = await createTestDb();
  const providerRootUserId = crypto.randomUUID();
  const state: TestState = {
    providerRootUserId,
    invites: new Map(),
    users: new Map(),
    credentials: new Map(),
    sessions: [],
  };
  state.users.set(providerRootUserId, {
    id: providerRootUserId,
    username: "provider-root",
    invitedBy: null,
  });

  const app = createPasskeyApp(createInMemoryPasskeyStorage(state));
  const bootstrapInviteToken = crypto.randomUUID();
  state.invites.set(bootstrapInviteToken, {
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
    db,
    state,
    async seedInvite(overrides?: {
      type?: "user" | "device";
      inviterUserId?: string | null;
      targetUserId?: string;
      label?: string;
      expiresAt?: number;
      usedAt?: number | null;
    }) {
      const token = crypto.randomUUID();
      state.invites.set(token, {
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
      state.users.set(userId, { id: userId, username });

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
      state.credentials.set(credential.id, credential);

      return {
        username,
        userId,
        credential,
      };
    },
  };
}
