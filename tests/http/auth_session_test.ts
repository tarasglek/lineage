import { signAuthSessionToken, signFlowToken } from "../../src/auth/jwt.ts";
import { createTestApp } from "../helpers/test_app.ts";

Deno.test("protected page redirects to /login for expired auth cookie", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const alice = await seedUserWithPasskey("alice");
  const expiredToken = await signAuthSessionToken(
    { userId: alice.userId, username: alice.username },
    { expiresInSeconds: -10 },
  );

  const res = await app.request("/account", {
    headers: { cookie: `auth=${expiredToken}` },
    redirect: "manual",
  });

  if (res.status !== 302) throw new Error(`expected 302, got ${res.status}`);
  if (res.headers.get("location") !== "/login") {
    throw new Error(`expected redirect to /login, got ${res.headers.get("location")}`);
  }
});

Deno.test("protected page redirects to /login for invalid auth cookie", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/account", {
    headers: { cookie: "auth=bad-auth-token" },
    redirect: "manual",
  });

  if (res.status !== 302) throw new Error(`expected 302, got ${res.status}`);
  if (res.headers.get("location") !== "/login") {
    throw new Error(`expected redirect to /login, got ${res.headers.get("location")}`);
  }
});

Deno.test("register completion rejects wrong flow token type", async () => {
  const { app } = await createTestApp();
  const wrongTypeToken = await signFlowToken({
    flowType: "login",
    challenge: "challenge-1",
    username: "alice",
    userId: "user-1",
  });

  const res = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "credential-1",
      flowToken: wrongTypeToken,
      response: {
        clientDataJSON: btoa(JSON.stringify({ challenge: "challenge-1", origin: "http://localhost" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""),
        attestationObject: btoa(JSON.stringify({ authData: { rpId: "localhost" } })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""),
      },
    }),
  });

  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "invalid_flow_token") {
    throw new Error(`expected invalid_flow_token, got ${body.error}`);
  }
});
