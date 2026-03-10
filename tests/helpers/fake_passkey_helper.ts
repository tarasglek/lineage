import type {
  AssertionResponse,
  AttestationResponse,
  CreationOptions,
  RequestOptions,
  StoredCredential,
} from "./passkey_types.ts";

function toBase64Url(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomId() {
  return crypto.randomUUID().replaceAll("-", "");
}

function assertSupportedAlgorithm(options: CreationOptions) {
  const algorithm = options.pubKeyCredParams?.[0]?.alg ?? -7;
  if (algorithm !== -7) {
    throw new Error("unsupported_algorithm");
  }
  return algorithm;
}

export function makeCreationOptionsFixture(): CreationOptions {
  return {
    challenge: toBase64Url("test-challenge"),
    rp: { id: "localhost", name: "Lineage invite-network" },
    user: { id: "user-1", name: "alice", displayName: "alice" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  };
}

export async function createAttestationResponse(
  options: CreationOptions,
): Promise<AttestationResponse> {
  return createPasskeyHelper({ id: options.rp.id, origin: "http://localhost" })
    .createAttestationResponse(options);
}

export function createPasskeyHelper(rp: { id: string; origin: string }) {
  const credentials = new Map<string, StoredCredential>();

  return {
    credentials,
    async createAttestationResponse(options: CreationOptions): Promise<AttestationResponse> {
      if (options.rp.id !== rp.id) {
        throw new Error("rp_id_mismatch");
      }
      const algorithm = assertSupportedAlgorithm(options);

      const credentialId = randomId();
      const credential: StoredCredential = {
        id: credentialId,
        publicKey: toBase64Url(`public-key:${credentialId}`),
        algorithm,
        signCount: 0,
        userId: options.user.id,
        transports: ["internal"],
      };
      credentials.set(credentialId, credential);

      const clientDataJSON = toBase64Url(JSON.stringify({
        type: "webauthn.create",
        challenge: options.challenge,
        origin: rp.origin,
        crossOrigin: false,
      }));

      const attestationObject = toBase64Url(JSON.stringify({
        fmt: "none",
        authData: {
          rpId: rp.id,
          credentialId,
          publicKey: credential.publicKey,
          algorithm: credential.algorithm,
          signCount: credential.signCount,
          userId: credential.userId,
          transports: credential.transports,
        },
      }));

      return {
        id: credentialId,
        rawId: credentialId,
        type: "public-key",
        response: {
          clientDataJSON,
          attestationObject,
        },
      };
    },
    async createAssertionResponse(
      options: RequestOptions,
      credential: StoredCredential,
    ): Promise<AssertionResponse> {
      if (options.rpId !== rp.id) {
        throw new Error("rp_id_mismatch");
      }
      const stored = credentials.get(credential.id) ?? { ...credential };
      stored.signCount += 1;
      credentials.set(stored.id, stored);

      return {
        id: stored.id,
        rawId: stored.id,
        type: "public-key",
        response: {
          clientDataJSON: toBase64Url(JSON.stringify({
            type: "webauthn.get",
            challenge: options.challenge,
            origin: rp.origin,
            crossOrigin: false,
          })),
          authenticatorData: toBase64Url(JSON.stringify({
            rpId: rp.id,
            signCount: stored.signCount,
          })),
          signature: toBase64Url(`sig:${stored.id}:${stored.signCount}`),
          userHandle: toBase64Url(stored.userId),
        },
      };
    },
  };
}
