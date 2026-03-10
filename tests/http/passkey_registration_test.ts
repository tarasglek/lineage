import { runRegisterResponse } from "../helpers/passkey_helper_cli.ts";
import { createTestApp } from "../helpers/test_app.ts";

Deno.test("GET /register renders one-step passkey registration page", async () => {
  const { app } = await createTestApp();

  const res = await app.request(
    "/register?inviteToken=test-invite&username=alice",
  );

  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const html = await res.text();
  if (!html.includes('data-invite-token="test-invite"')) {
    throw new Error("missing invite token");
  }
  if (!html.includes('data-username="alice"')) {
    throw new Error("missing username");
  }
  if (!html.includes('id="username"')) {
    throw new Error("missing username input");
  }
  if (!html.includes("Create account with passkey")) {
    throw new Error("missing passkey action button");
  }
  if (!html.includes('id="status"')) {
    throw new Error("missing status box");
  }
  if (!html.includes('src="/static/passkey-register.js?time=')) {
    throw new Error("missing external register script");
  }
  if (!html.includes('src="/static/passkey-shared.js?time=')) {
    throw new Error("missing shared passkey script");
  }
});

Deno.test("GET /register/passkey redirects back to one-step register page", async () => {
  const { app } = await createTestApp();
  const res = await app.request(
    "/register/passkey?inviteToken=test-invite&username=alice",
    { redirect: "manual" },
  );
  if (res.status !== 303) throw new Error(`expected 303, got ${res.status}`);
  if (
    res.headers.get("location") !==
      "/register?inviteToken=test-invite&username=alice"
  ) {
    throw new Error(`unexpected redirect: ${res.headers.get("location")}`);
  }
});

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
  if (!body.flowToken) throw new Error("missing flowToken");
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
  const { app, seedInvite, getCredential, getInvite } = await createTestApp();
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
    body: JSON.stringify({
      ...attestation,
      flowToken: creationOptions.flowToken,
    }),
  });

  if (completeRes.status !== 200) {
    throw new Error(`expected 200, got ${completeRes.status}`);
  }

  const storedCredential = getCredential(attestation.id);
  if (!storedCredential) throw new Error("credential was not stored");

  const invite = getInvite(inviteToken);
  if (!invite?.usedAt) throw new Error("invite was not consumed");
});

Deno.test("POST /register/complete rejects a missing flow token", async () => {
  const { app, seedInvite } = await createTestApp();
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

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "missing_flow_token") {
    throw new Error(`expected missing_flow_token, got ${body.error}`);
  }
});

Deno.test("POST /register/complete rejects a tampered flow token", async () => {
  const { app } = await createTestApp();
  const generated = await runRegisterResponse({
    origin: "http://localhost",
    creationOptions: {
      challenge: "missing-session-challenge",
      rp: { id: "localhost", name: "Lineage invite-network" },
      user: { id: "user-1", name: "alice", displayName: "alice" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    },
  });
  const attestation = generated.attestationResponse;

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...attestation, flowToken: "bad-flow-token" }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "invalid_flow_token") {
    throw new Error(`expected invalid_flow_token, got ${body.error}`);
  }
});

Deno.test("POST /register/complete rejects an expired flow token", async () => {
  const { app, seedInvite } = await createTestApp();
  const inviteToken = await seedInvite({ expiresAt: Date.now() + 60_000 });

  const beginRes = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });
  const creationOptions = await beginRes.json();
  const parts = String(creationOptions.flowToken).split(".");
  if (parts.length !== 3) throw new Error("expected jwt");
  const payloadJson = JSON.parse(
    atob(
      parts[1].replace(/-/g, "+").replace(/_/g, "/") +
        "===".slice((parts[1].length + 3) % 4),
    ),
  );
  payloadJson.exp = Math.floor(Date.now() / 1000) - 10;
  const expiredPayload = btoa(JSON.stringify(payloadJson)).replace(/\+/g, "-")
    .replace(/\//g, "_").replace(/=+$/g, "");
  const expiredFlowToken = `${parts[0]}.${expiredPayload}.${parts[2]}`;

  const generated = await runRegisterResponse({
    origin: "http://localhost",
    creationOptions,
  });
  const attestation = generated.attestationResponse;

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...attestation, flowToken: expiredFlowToken }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "invalid_flow_token") {
    throw new Error(`expected invalid_flow_token, got ${body.error}`);
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

  const generated = await runRegisterResponse({
    origin: "http://localhost",
    creationOptions,
  });
  const attestation = generated.attestationResponse;

  const firstRes = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...attestation,
      flowToken: creationOptions.flowToken,
    }),
  });
  if (firstRes.status !== 200) {
    throw new Error(`expected initial 200, got ${firstRes.status}`);
  }

  const secondRes = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...attestation,
      flowToken: creationOptions.flowToken,
    }),
  });

  if (secondRes.status !== 409) {
    throw new Error(`expected 409, got ${secondRes.status}`);
  }
  const body = await secondRes.json();
  if (body.error !== "invite_already_used") {
    throw new Error(`expected invite_already_used, got ${body.error}`);
  }
});

Deno.test("POST /register/complete rejects a duplicate username", async () => {
  const { app, seedInvite, seedUserWithPasskey } = await createTestApp();
  await seedUserWithPasskey("alice");
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

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...attestation,
      flowToken: creationOptions.flowToken,
    }),
  });

  if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "username_taken") {
    throw new Error(`expected username_taken, got ${body.error}`);
  }
});

Deno.test("POST /register/complete rejects a reused invite", async () => {
  const { app, seedInvite, getInvite, putInvite } = await createTestApp();
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

  const invite = getInvite(inviteToken);
  if (!invite) throw new Error("missing invite");
  putInvite({ ...invite, usedAt: Date.now() });

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...attestation,
      flowToken: creationOptions.flowToken,
    }),
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

  const generated = await runRegisterResponse({
    origin: "http://localhost",
    creationOptions,
  });
  const attestation = generated.attestationResponse;
  const clientData = JSON.parse(
    atob(
      attestation.response.clientDataJSON.replace(/-/g, "+").replace(
        /_/g,
        "/",
      ) + "===".slice((attestation.response.clientDataJSON.length + 3) % 4),
    ),
  );
  clientData.origin = "https://evil.example";
  attestation.response.clientDataJSON = btoa(JSON.stringify(clientData))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...attestation,
      flowToken: creationOptions.flowToken,
    }),
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

  const generated = await runRegisterResponse({
    origin: "http://localhost",
    creationOptions,
  });
  const attestation = generated.attestationResponse;
  const attestationObjectJson = JSON.parse(
    atob(
      attestation.response.attestationObject.replace(/-/g, "+").replace(
        /_/g,
        "/",
      ) + "===".slice((attestation.response.attestationObject.length + 3) % 4),
    ),
  );
  attestationObjectJson.authData.rpId = "evil.example";
  attestation.response.attestationObject = btoa(
    JSON.stringify(attestationObjectJson),
  ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...attestation,
      flowToken: creationOptions.flowToken,
    }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "rp_id_mismatch") {
    throw new Error(`expected rp_id_mismatch, got ${body.error}`);
  }
});
