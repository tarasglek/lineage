import { signFlowToken } from "../../src/auth/jwt.ts";
import { runLoginResponse } from "../helpers/passkey_helper_cli.ts";
import { createTestApp } from "../helpers/test_app.ts";

Deno.test("POST /login/begin returns assertion options for a known account", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const user = await seedUserWithPasskey("alice");

  const res = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: user.username }),
  });

  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const body = await res.json();
  if (!body.challenge) throw new Error("missing challenge");
  if (!body.flowToken) throw new Error("missing flowToken");
  if (!Array.isArray(body.allowCredentials)) throw new Error("missing allowCredentials");
});

Deno.test("POST /login/complete accepts a valid assertion response", async () => {
  const { app, seedUserWithPasskey, state } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();
  const previousSignCount = seeded.credential.signCount;

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: {
      id: seeded.credential.id,
      userId: seeded.credential.userId,
      rpId: seeded.credential.rpId,
      algorithm: seeded.credential.algorithm,
      publicKey: seeded.credential.publicKey,
      publicKeyPem: seeded.credential.publicKeyPem,
      privateKeyPem: seeded.credential.privateKeyPem,
      signCount: seeded.credential.signCount,
    },
  });
  const assertion = generated.assertionResponse;

  const completeRes = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...assertion, flowToken: requestOptions.flowToken }),
  });

  if (completeRes.status !== 200) throw new Error(`expected 200, got ${completeRes.status}`);
  if (!completeRes.headers.get("set-cookie")) throw new Error("missing auth cookie");

  const storedCredential = state.credentials.get(seeded.credential.id);
  if (!storedCredential) throw new Error("credential missing after login");
  if (storedCredential.signCount <= previousSignCount) {
    throw new Error("sign count did not increase");
  }
  if (state.sessions.length !== 1) throw new Error(`expected 1 auth session, got ${state.sessions.length}`);
});

Deno.test("POST /login/complete rejects a missing flow token", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: seeded.credential,
  });

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(generated.assertionResponse),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "missing_flow_token") {
    throw new Error(`expected missing_flow_token, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects a tampered flow token", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: seeded.credential,
  });

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...generated.assertionResponse, flowToken: "bad-flow-token" }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "invalid_flow_token") {
    throw new Error(`expected invalid_flow_token, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects an expired flow token", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();
  const expiredFlowToken = await signFlowToken({
    flowType: "login",
    challenge: requestOptions.challenge,
    username: seeded.username,
    userId: seeded.userId,
  }, { expiresInSeconds: -10 });

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: seeded.credential,
  });

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...generated.assertionResponse, flowToken: expiredFlowToken }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "flow_token_expired") {
    throw new Error(`expected flow_token_expired, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects a wrong flow token type", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();
  const parts = String(requestOptions.flowToken).split(".");
  if (parts.length !== 3) throw new Error("expected jwt");
  const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/") + "===".slice((parts[1].length + 3) % 4)));
  payloadJson.type = "register-flow";
  const wrongTypePayload = btoa(JSON.stringify(payloadJson)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const wrongTypeToken = `${parts[0]}.${wrongTypePayload}.${parts[2]}`;

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: seeded.credential,
  });

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...generated.assertionResponse, flowToken: wrongTypeToken }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "invalid_flow_token") {
    throw new Error(`expected invalid_flow_token, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects a wrong challenge", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions: {
      ...requestOptions,
      challenge: "wrong-challenge",
    },
    credential: seeded.credential,
  });
  const assertion = generated.assertionResponse;

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...assertion, flowToken: requestOptions.flowToken }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "authentication_session_not_found") {
    throw new Error(`expected authentication_session_not_found, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects an unknown credential id", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: {
      ...seeded.credential,
      id: "unknown-credential",
    },
  });
  const assertion = generated.assertionResponse;

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...assertion, flowToken: requestOptions.flowToken }),
  });

  if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "credential_not_found") {
    throw new Error(`expected credential_not_found, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects a credential not owned by the user", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const alice = await seedUserWithPasskey("alice");
  const bob = await seedUserWithPasskey("bob");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: alice.username }),
  });
  const requestOptions = await beginRes.json();

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: bob.credential,
  });
  const assertion = generated.assertionResponse;

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...assertion, flowToken: requestOptions.flowToken }),
  });

  if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "credential_not_owned_by_user") {
    throw new Error(`expected credential_not_owned_by_user, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects a counter rollback", async () => {
  const { app, seedUserWithPasskey, state } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");
  const stored = state.credentials.get(seeded.credential.id);
  if (!stored) throw new Error("missing credential");
  stored.signCount = 10;

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: {
      ...seeded.credential,
      signCount: 0,
    },
  });
  const assertion = generated.assertionResponse;

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...assertion, flowToken: requestOptions.flowToken }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "sign_count_rollback") {
    throw new Error(`expected sign_count_rollback, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects an origin mismatch", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: seeded.credential,
  });
  const assertion = generated.assertionResponse;
  const clientData = JSON.parse(atob(assertion.response.clientDataJSON.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((assertion.response.clientDataJSON.length + 3) % 4)));
  clientData.origin = "https://evil.example";
  assertion.response.clientDataJSON = btoa(JSON.stringify(clientData)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...assertion, flowToken: requestOptions.flowToken }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "origin_mismatch") {
    throw new Error(`expected origin_mismatch, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects a tampered signature", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: seeded.credential,
  });
  const assertion = generated.assertionResponse;
  assertion.response.signature = assertion.response.signature.slice(0, -2) + "ab";

  const res = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...assertion, flowToken: requestOptions.flowToken }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "invalid_signature") {
    throw new Error(`expected invalid_signature, got ${body.error}`);
  }
});

Deno.test("POST /login/complete rejects a replayed assertion", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();

  const generated = await runLoginResponse({
    origin: "http://localhost",
    requestOptions,
    credential: seeded.credential,
  });
  const assertion = generated.assertionResponse;

  const firstRes = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...assertion, flowToken: requestOptions.flowToken }),
  });
  if (firstRes.status !== 200) throw new Error(`expected initial 200, got ${firstRes.status}`);

  const secondRes = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...assertion, flowToken: requestOptions.flowToken }),
  });

  if (secondRes.status !== 400) throw new Error(`expected 400, got ${secondRes.status}`);
  const body = await secondRes.json();
  if (body.error !== "sign_count_rollback") {
    throw new Error(`expected sign_count_rollback, got ${body.error}`);
  }
});
