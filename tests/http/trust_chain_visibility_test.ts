import { createTestApp } from "../helpers/test_app.ts";

Deno.test("GET /account shows trust chain details for authenticated user", async () => {
  const t = await createTestApp();
  const alice = await t.seedUserWithPasskey("alice");
  const bob = await t.seedUserWithPasskey("bob");
  t.state.users.set(bob.userId, { ...t.state.users.get(bob.userId)!, invitedBy: alice.userId });
  const bobInvite = await t.seedInvite({ type: "device", inviterUserId: bob.userId, targetUserId: bob.userId, label: "bob-phone" });

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
  if (!html.includes('data-username="bob"')) throw new Error("missing username");
  if (!html.includes(`data-invited-by="${alice.userId}"`)) throw new Error("missing invited-by");
  if (!html.includes(`data-invite-token="${bobInvite}"`)) throw new Error("missing created invite");
  if (!html.includes("data-credential-id=")) throw new Error("missing credentials");
});
