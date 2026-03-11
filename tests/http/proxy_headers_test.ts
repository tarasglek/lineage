import { runLoginResponse, runRegisterResponse } from "../helpers/passkey_helper_cli.ts";
import { createTestApp } from "../helpers/test_app.ts";

Deno.test("register and login use forwarded host/proto for WebAuthn and secure cookies", async () => {
  const t = await createTestApp();
  const headers = {
    "content-type": "application/json",
    "x-forwarded-proto": "https",
    "x-forwarded-host": "passkeys.example.test",
  };

  const staticRes = await t.app.request("/static/style.css");
  if (staticRes.headers.get("cache-control") !== "no-store, max-age=0") {
    throw new Error(`unexpected static cache-control: ${staticRes.headers.get("cache-control")}`);
  }
  if (staticRes.headers.get("pragma") !== "no-cache") {
    throw new Error(`unexpected static pragma: ${staticRes.headers.get("pragma")}`);
  }
  if (staticRes.headers.get("expires") !== "0") {
    throw new Error(`unexpected static expires: ${staticRes.headers.get("expires")}`);
  }

  const inviteToken = await t.seedInvite();
  const beginRegisterRes = await t.app.request("/register/begin", {
    method: "POST",
    headers,
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });
  if (beginRegisterRes.status !== 200) throw new Error(`expected 200, got ${beginRegisterRes.status}`);
  const creationOptions = await beginRegisterRes.json();
  if (creationOptions.rp.id !== "passkeys.example.test") {
    throw new Error(`expected forwarded rp id, got ${creationOptions.rp.id}`);
  }

  const registerGenerated = await runRegisterResponse({
    origin: "https://passkeys.example.test",
    creationOptions,
  });
  const completeRegisterRes = await t.app.request("/register/complete", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...registerGenerated.attestationResponse, flowToken: creationOptions.flowToken }),
  });
  if (completeRegisterRes.status !== 200) throw new Error(`expected 200, got ${completeRegisterRes.status}`);
  const registerCookie = completeRegisterRes.headers.get("set-cookie") ?? "";
  if (!registerCookie.includes("Secure")) {
    throw new Error(`expected secure auth cookie, got ${registerCookie}`);
  }

  const beginLoginRes = await t.app.request("/login/begin", {
    method: "POST",
    headers,
    body: JSON.stringify({ username: "alice" }),
  });
  if (beginLoginRes.status !== 200) throw new Error(`expected 200, got ${beginLoginRes.status}`);
  const requestOptions = await beginLoginRes.json();
  if (requestOptions.rpId !== "passkeys.example.test") {
    throw new Error(`expected forwarded rp id, got ${requestOptions.rpId}`);
  }

  const loginGenerated = await runLoginResponse({
    origin: "https://passkeys.example.test",
    requestOptions,
    credential: {
      id: registerGenerated.credential.id,
      userId: registerGenerated.credential.userId,
      rpId: registerGenerated.credential.rpId,
      algorithm: registerGenerated.credential.algorithm,
      publicKey: registerGenerated.credential.publicKey,
      publicKeyPem: registerGenerated.credential.publicKeyPem,
      privateKeyPem: registerGenerated.credential.privateKeyPem,
      signCount: registerGenerated.credential.signCount,
    },
  });
  const completeLoginRes = await t.app.request("/login/complete", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...loginGenerated.assertionResponse, flowToken: requestOptions.flowToken }),
  });
  if (completeLoginRes.status !== 200) throw new Error(`expected 200, got ${completeLoginRes.status}`);
  const loginCookie = completeLoginRes.headers.get("set-cookie") ?? "";
  if (!loginCookie.includes("Secure")) {
    throw new Error(`expected secure auth cookie, got ${loginCookie}`);
  }
});
