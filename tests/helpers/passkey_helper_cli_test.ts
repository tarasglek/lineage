import { runRegisterResponse } from "./passkey_helper_cli.ts";

Deno.test("go passkey helper wrapper builds and runs register-response", async () => {
  const result = await runRegisterResponse({
    origin: "http://localhost",
    creationOptions: {
      challenge: "challenge-123",
      rp: { id: "localhost", name: "Lineage invite-network" },
      user: { id: "user-1", name: "alice", displayName: "alice" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    },
  });

  if (!result.attestationResponse?.id) {
    throw new Error("missing attestation response id");
  }
  if (!result.credential?.privateKeyPem) {
    throw new Error("missing credential private key");
  }
});
