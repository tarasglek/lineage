import { createTestApp } from "../helpers/test_app.ts";

function getCookie(res: Response) {
  return res.headers.get("set-cookie");
}

Deno.test("GET /invites/new redirects unauthenticated access to /login", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/invites/new", { redirect: "manual" });
  if (res.status !== 302) throw new Error(`expected 302, got ${res.status}`);
  if (res.headers.get("location") !== "/login") {
    throw new Error(`expected redirect to /login, got ${res.headers.get("location")}`);
  }
});

Deno.test("POST /invites redirects unauthenticated access to /login", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/invites", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ type: "user", label: "bob-user" }),
    redirect: "manual",
  });
  if (res.status !== 302) throw new Error(`expected 302, got ${res.status}`);
  if (res.headers.get("location") !== "/login") {
    throw new Error(`expected redirect to /login, got ${res.headers.get("location")}`);
  }
});

Deno.test("authenticated user can create an invite and inviter comes from session", async () => {
  const { app, seedUserWithPasskey, state } = await createTestApp();
  const alice = await seedUserWithPasskey("alice");

  const loginRes = await app.request("/test/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: alice.userId }),
  });
  if (loginRes.status !== 200) throw new Error(`expected 200, got ${loginRes.status}`);
  const cookie = getCookie(loginRes);
  if (!cookie) throw new Error("missing auth cookie");

  const res = await app.request("/invites", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
    },
    body: new URLSearchParams({ type: "user", label: "bob-user", inviterUserId: "forged-user" }),
  });
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

  const html = await res.text();
  const token = html.match(/data-token="([^"]+)"/)?.[1];
  if (!token) throw new Error("missing invite token");
  const invite = state.invites.get(token);
  if (!invite) throw new Error("invite not stored");
  if (invite.inviterUserId !== alice.userId) {
    throw new Error(`expected inviter ${alice.userId}, got ${invite.inviterUserId}`);
  }
});

Deno.test("device invite rejects a forged target user", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const alice = await seedUserWithPasskey("alice");
  const bob = await seedUserWithPasskey("bob");

  const loginRes = await app.request("/test/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: alice.userId }),
  });
  const cookie = getCookie(loginRes);
  if (!cookie) throw new Error("missing auth cookie");

  const res = await app.request("/invites", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
    },
    body: new URLSearchParams({ type: "device", label: "bob-device", targetUserId: bob.userId }),
  });
  if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
});
