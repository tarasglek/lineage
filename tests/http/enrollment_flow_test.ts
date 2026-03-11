import { runRegisterResponse } from "../helpers/passkey_helper_cli.ts";
import { createTestApp } from "../helpers/test_app.ts";

Deno.test("GET /enroll/passkey/:token renders enrollment page for device token", async () => {
  const t = await createTestApp();
  const alice = await t.seedUserWithPasskey("alice");
  const token = await t.seedInvite({
    type: "device",
    inviterUserId: alice.userId,
    targetUserId: alice.userId,
  });

  const res = await t.app.request(`/enroll/passkey/${token}`);
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

  const html = await res.text();
  if (!html.includes("Enroll passkey")) {
    throw new Error("missing enroll heading");
  }
  if (!html.includes('data-invite-token="' + token + '"')) {
    throw new Error("missing invite token data");
  }
  if (html.includes("Create account with passkey")) {
    throw new Error("should not use registration wording");
  }
  if (html.includes('id="username"')) {
    throw new Error("should not ask for username");
  }
  if (!html.includes('src="/static/passkey-enroll.js?time=')) {
    throw new Error("missing enroll script");
  }
});

Deno.test("POST /enroll/passkey/begin accepts device token without username", async () => {
  const t = await createTestApp();
  const alice = await t.seedUserWithPasskey("alice");
  const token = await t.seedInvite({
    type: "device",
    inviterUserId: alice.userId,
    targetUserId: alice.userId,
  });

  const res = await t.app.request("/enroll/passkey/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken: token }),
  });
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

  const body = await res.json();
  if (!body.flowToken) throw new Error("missing flow token");
  if (body.user?.name !== "alice") throw new Error(`expected alice, got ${body.user?.name}`);
});

Deno.test("POST /enroll/passkey/begin rejects user invite token", async () => {
  const t = await createTestApp();
  const token = await t.seedInvite({ type: "user" });

  const res = await t.app.request("/enroll/passkey/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken: token }),
  });
  if (res.status !== 409) throw new Error(`expected 409, got ${res.status}`);

  const body = await res.json();
  if (body.error !== "wrong_invite_type") {
    throw new Error(`expected wrong_invite_type, got ${body.error}`);
  }
});

Deno.test("POST /enroll/passkey/complete adds credential to existing user", async () => {
  const t = await createTestApp();
  const alice = await t.seedUserWithPasskey("alice");
  const token = await t.seedInvite({
    type: "device",
    inviterUserId: alice.userId,
    targetUserId: alice.userId,
  });

  const beginRes = await t.app.request("/enroll/passkey/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken: token }),
  });
  const creationOptions = await beginRes.json();

  const generated = await runRegisterResponse({
    origin: "http://localhost",
    creationOptions,
  });

  const completeRes = await t.app.request("/enroll/passkey/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...generated.attestationResponse,
      flowToken: creationOptions.flowToken,
    }),
  });
  if (completeRes.status !== 200) throw new Error(`expected 200, got ${completeRes.status}`);

  const users = t.listUsers().filter((user) => user.username === "alice");
  if (users.length !== 1) throw new Error(`expected 1 alice user, got ${users.length}`);

  const aliceCredentials = t.listCredentials().filter((credential) => credential.userId === alice.userId);
  if (aliceCredentials.length !== 2) {
    throw new Error(`expected 2 credentials for alice, got ${aliceCredentials.length}`);
  }
});
