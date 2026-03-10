import { runRegisterResponse } from "./passkey_helper_cli.ts";
import { createPasskeyHelper } from "./passkey_helper.ts";
import { createPasskeyApp, type TestState } from "../../src/passkey_app.ts";
import { createTestDb } from "./test_db.ts";

export async function createTestApp() {
  const db = await createTestDb();
  const state: TestState = {
    invites: new Map(),
    registrationSessions: new Map(),
    authenticationSessions: new Map(),
    users: new Map(),
    credentials: new Map(),
    sessions: [],
  };

  const app = createPasskeyApp(state);

  return {
    app,
    db,
    state,
    async seedInvite(overrides?: { expiresAt?: number; usedAt?: number | null }) {
      const token = crypto.randomUUID();
      state.invites.set(token, {
        token,
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
      const passkeyHelper = createPasskeyHelper({ id: "localhost", origin: "http://localhost" });
      passkeyHelper.credentials.set(credential.id, {
        id: credential.id,
        publicKey: credential.publicKey,
        publicKeyPem: credential.publicKeyPem,
        privateKeyPem: credential.privateKeyPem,
        rpId: credential.rpId,
        algorithm: credential.algorithm,
        signCount: credential.signCount,
        userId,
        transports: ["internal"],
      });

      return {
        username,
        userId,
        credential,
        passkeyHelper,
      };
    },
  };
}
