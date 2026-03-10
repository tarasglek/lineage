import { runRegisterResponse } from "../helpers/passkey_helper_cli.ts";
import { createPasskeyHelper } from "../helpers/fake_passkey_helper.ts";
import { createTestApp } from "../helpers/test_app.ts";

Deno.test("POST /register/begin returns WebAuthn creation options for a valid invite", async () => {
  const { app, seedInvite } = await createTestApp();
  const inviteToken = await seedInvite();

  const res = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });

  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

  const body = await res.json();
  if (!body.challenge) throw new Error("missing challenge");
  if (!body.user) throw new Error("missing user");
});

Deno.test("POST /register/begin rejects a missing invite", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "alice" }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);

  const body = await res.json();
  if (body.error !== "missing_invite_token") {
    throw new Error(`expected missing_invite_token, got ${body.error}`);
  }
});

Deno.test("POST /register/begin rejects an expired invite", async () => {
  const { app, seedInvite } = await createTestApp();
  const inviteToken = await seedInvite({ expiresAt: Date.now() - 1 });

  const res = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });

  if (res.status !== 410) throw new Error(`expected 410, got ${res.status}`);

  const body = await res.json();
  if (body.error !== "invite_expired") {
    throw new Error(`expected invite_expired, got ${body.error}`);
  }
});

Deno.test("POST /register/begin rejects an already-used invite", async () => {
  const { app, seedInvite } = await createTestApp();
  const inviteToken = await seedInvite({ usedAt: Date.now() });

  const res = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });

  if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);

  const body = await res.json();
  if (body.error !== "invite_already_used") {
    throw new Error(`expected invite_already_used, got ${body.error}`);
  }
});

Deno.test("POST /register/begin rejects malformed request body", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);

  const body = await res.json();
  if (body.error !== "invalid_json") {
    throw new Error(`expected invalid_json, got ${body.error}`);
  }
});

Deno.test("POST /register/complete accepts a valid attestation response", async () => {
  const { app, seedInvite, state } = await createTestApp();
  const inviteToken = await seedInvite();

  const beginRes = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });
  const creationOptions = await beginRes.json();

  const generated = await runRegisterResponse({
    origin: "http://localhost",
    creationOptions,
  });
  const attestation = generated.attestationResponse;

  const completeRes = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });

  if (completeRes.status !== 200) throw new Error(`expected 200, got ${completeRes.status}`);

  const storedCredential = state.credentials.get(attestation.id);
  if (!storedCredential) throw new Error("credential was not stored");

  const invite = state.invites.get(inviteToken);
  if (!invite?.usedAt) throw new Error("invite was not consumed");
});

Deno.test("POST /register/complete rejects a missing stored challenge", async () => {
  const { app } = await createTestApp();
  const helper = createPasskeyHelper({ id: "localhost", origin: "http://localhost" });
  const attestation = await helper.createAttestationResponse({
    challenge: "missing-session-challenge",
    rp: { id: "localhost", name: "Lineage invite-network" },
    user: { id: "user-1", name: "alice", displayName: "alice" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  });

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "registration_session_not_found") {
    throw new Error(`expected registration_session_not_found, got ${body.error}`);
  }
});

Deno.test("POST /register/complete rejects a replayed completion request", async () => {
  const { app, seedInvite } = await createTestApp();
  const inviteToken = await seedInvite();

  const beginRes = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });
  const creationOptions = await beginRes.json();

  const helper = createPasskeyHelper({ id: creationOptions.rp.id, origin: "http://localhost" });
  const attestation = await helper.createAttestationResponse(creationOptions);

  const firstRes = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });
  if (firstRes.status !== 200) throw new Error(`expected initial 200, got ${firstRes.status}`);

  const secondRes = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });

  if (secondRes.status !== 400) throw new Error(`expected 400, got ${secondRes.status}`);
  const body = await secondRes.json();
  if (body.error !== "registration_session_not_found") {
    throw new Error(`expected registration_session_not_found, got ${body.error}`);
  }
});

Deno.test("POST /register/complete rejects a reused invite", async () => {
  const { app, seedInvite, state } = await createTestApp();
  const inviteToken = await seedInvite();

  const beginRes = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });
  const creationOptions = await beginRes.json();

  const helper = createPasskeyHelper({ id: creationOptions.rp.id, origin: "http://localhost" });
  const attestation = await helper.createAttestationResponse(creationOptions);

  const invite = state.invites.get(inviteToken);
  if (!invite) throw new Error("missing invite");
  invite.usedAt = Date.now();

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });

  if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "invite_already_used") {
    throw new Error(`expected invite_already_used, got ${body.error}`);
  }
});

Deno.test("POST /register/complete rejects an origin mismatch", async () => {
  const { app, seedInvite } = await createTestApp();
  const inviteToken = await seedInvite();

  const beginRes = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });
  const creationOptions = await beginRes.json();

  const helper = createPasskeyHelper({ id: creationOptions.rp.id, origin: "https://evil.example" });
  const attestation = await helper.createAttestationResponse(creationOptions);

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "origin_mismatch") {
    throw new Error(`expected origin_mismatch, got ${body.error}`);
  }
});

Deno.test("POST /register/complete rejects an RP ID mismatch", async () => {
  const { app, seedInvite } = await createTestApp();
  const inviteToken = await seedInvite();

  const beginRes = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });
  const creationOptions = await beginRes.json();

  const helper = createPasskeyHelper({ id: creationOptions.rp.id, origin: "http://localhost" });
  const attestation = await helper.createAttestationResponse(creationOptions);
  const attestationObjectJson = JSON.parse(atob(attestation.response.attestationObject.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((attestation.response.attestationObject.length + 3) % 4)));
  attestationObjectJson.authData.rpId = "evil.example";
  attestation.response.attestationObject = btoa(JSON.stringify(attestationObjectJson)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "rp_id_mismatch") {
    throw new Error(`expected rp_id_mismatch, got ${body.error}`);
  }
});
