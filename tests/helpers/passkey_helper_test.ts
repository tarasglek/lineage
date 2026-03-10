import {
  createAttestationResponse,
  createPasskeyHelper,
  makeCreationOptionsFixture,
} from "./fake_passkey_helper.ts";

Deno.test("passkey helper creates an attestation response from creation options", async () => {
  const options = makeCreationOptionsFixture();
  const response = await createAttestationResponse(options);

  if (!response.id) throw new Error("missing credential id");
  if (response.type !== "public-key") throw new Error("wrong type");
  if (!response.response?.clientDataJSON) throw new Error("missing clientDataJSON");
});

Deno.test("passkey helper rejects mismatched RP ID input", async () => {
  const options = makeCreationOptionsFixture();
  const helper = createPasskeyHelper({ id: "evil.example", origin: "http://localhost" });

  let threw = false;
  try {
    await helper.createAttestationResponse(options);
  } catch (error) {
    threw = true;
    if (!(error instanceof Error) || !error.message.includes("rp_id_mismatch")) {
      throw error;
    }
  }

  if (!threw) throw new Error("expected rp_id_mismatch error");
});

Deno.test("passkey helper rejects unsupported algorithm for now", async () => {
  const helper = createPasskeyHelper({ id: "localhost", origin: "http://localhost" });
  const options = makeCreationOptionsFixture();
  options.pubKeyCredParams = [{ type: "public-key", alg: -257 }];

  let threw = false;
  try {
    await helper.createAttestationResponse(options);
  } catch (error) {
    threw = true;
    if (!(error instanceof Error) || !error.message.includes("unsupported_algorithm")) {
      throw error;
    }
  }

  if (!threw) throw new Error("expected unsupported_algorithm error");
});

Deno.test("passkey helper tracks sign count across assertions", async () => {
  const helper = createPasskeyHelper({ id: "localhost", origin: "http://localhost" });
  const creationOptions = makeCreationOptionsFixture();
  const attestation = await helper.createAttestationResponse(creationOptions);
  const credential = helper.credentials.get(attestation.id);
  if (!credential) throw new Error("missing credential");

  const requestOptions = {
    challenge: "challenge-1",
    rpId: "localhost",
    allowCredentials: [{ id: credential.id, type: "public-key" }],
  };

  const first = await helper.createAssertionResponse(requestOptions, credential);
  const second = await helper.createAssertionResponse(requestOptions, credential);

  if (first.response.authenticatorData === second.response.authenticatorData) {
    throw new Error("expected sign count to change between assertions");
  }
});

Deno.test("passkey helper emits stable response shape expected by server verification", async () => {
  const options = makeCreationOptionsFixture();
  const attestation = await createAttestationResponse(options);

  if (typeof attestation.id !== "string") throw new Error("id must be string");
  if (typeof attestation.rawId !== "string") throw new Error("rawId must be string");
  if (typeof attestation.response.attestationObject !== "string") {
    throw new Error("attestationObject must be string");
  }

  const helper = createPasskeyHelper({ id: "localhost", origin: "http://localhost" });
  const seeded = await helper.createAttestationResponse(options);
  const credential = helper.credentials.get(seeded.id);
  if (!credential) throw new Error("missing seeded credential");
  const assertion = await helper.createAssertionResponse({
    challenge: "challenge-2",
    rpId: "localhost",
    allowCredentials: [{ id: credential.id, type: "public-key" }],
  }, credential);

  if (typeof assertion.response.authenticatorData !== "string") {
    throw new Error("authenticatorData must be string");
  }
  if (typeof assertion.response.signature !== "string") {
    throw new Error("signature must be string");
  }
  if (typeof assertion.response.userHandle !== "string") {
    throw new Error("userHandle must be string");
  }
});
