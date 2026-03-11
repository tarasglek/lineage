import { createTestApp } from "../helpers/test_app.ts";

Deno.test("GET /account shows identity-first account view for authenticated user", async () => {
  const t = await createTestApp();
  const alice = await t.seedUserWithPasskey("alice");
  const bob = await t.seedUserWithPasskey("bob");
  t.putUser({ ...t.getUser(bob.userId)!, invitedBy: alice.userId });
  const bobInvite = await t.seedInvite({
    type: "device",
    inviterUserId: bob.userId,
    targetUserId: bob.userId,
    label: "bob-phone",
  });
  await t.seedInvite({
    type: "device",
    inviterUserId: bob.userId,
    targetUserId: bob.userId,
    label: "bob-used",
    usedAt: Date.now(),
  });
  const expiredInvite = await t.seedInvite({
    type: "device",
    inviterUserId: bob.userId,
    targetUserId: bob.userId,
    label: "bob-expired",
    expiresAt: Date.now() - 1,
  });

  const loginRes = await t.app.request("/test/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: bob.userId }),
  });
  const cookie = loginRes.headers.get("set-cookie");
  if (!cookie) throw new Error("missing auth cookie");

  const res = await t.app.request("/account", {
    headers: { cookie },
  });
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

  const html = await res.text();
  if (!html.includes("Signed in as bob")) {
    throw new Error("missing identity headline");
  }
  if (!html.includes('data-username="bob"')) {
    throw new Error("missing username");
  }
  if (!html.includes(`data-invited-by="${alice.userId}"`)) {
    throw new Error("missing invited-by");
  }
  if (!html.includes("<h2>Passkeys</h2>")) {
    throw new Error("missing passkeys section");
  }
  if (!html.includes("Enroll another passkey")) {
    throw new Error("missing enroll passkey action");
  }
  if (!html.includes("<h2>Invite users</h2>")) {
    throw new Error("missing invite users section");
  }
  if (!html.includes("<h3>Pending enrollments</h3>")) {
    throw new Error("missing pending enrollments section");
  }
  if (!html.includes(`data-device-invite-token="${bobInvite}"`)) {
    throw new Error("missing enrollment token");
  }
  if (!html.includes(`/enroll/passkey/${bobInvite}`)) {
    throw new Error("missing enrollment link");
  }
  if (html.includes(`data-device-invite-token="${expiredInvite}"`)) {
    throw new Error("expired enrollment should be hidden");
  }
  if (!html.includes("data-credential-id=")) {
    throw new Error("missing credentials");
  }
  if (!html.includes('action="/invites/user"')) {
    throw new Error("missing user invite action");
  }
  if (html.includes('/invites/new?type=device')) {
    throw new Error("should not link to removed legacy enroll form page");
  }
  if (!html.includes('action="/logout"')) {
    throw new Error("missing logout form");
  }

  const passkeysIndex = html.indexOf("<h2>Passkeys</h2>");
  const inviteIndex = html.indexOf("<h2>Invite users</h2>");
  if (passkeysIndex === -1 || inviteIndex === -1 || passkeysIndex > inviteIndex) {
    throw new Error("passkeys section should come before invite user");
  }
});
