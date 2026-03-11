import { createTestApp } from "../helpers/test_app.ts";

function getCookie(res: Response) {
  return res.headers.get("set-cookie");
}

Deno.test("legacy invite form routes are removed", async () => {
  const { app } = await createTestApp();

  const getRes = await app.request("/invites/new", { redirect: "manual" });
  if (getRes.status !== 404) throw new Error(`expected 404, got ${getRes.status}`);

  const postRes = await app.request("/invites", {
    method: "POST",
    redirect: "manual",
  });
  if (postRes.status !== 404) throw new Error(`expected 404, got ${postRes.status}`);
});

Deno.test("legacy enroll wording is absent from user-facing invite routes", async () => {
  const { app, seedInvite } = await createTestApp();
  const userToken = await seedInvite({ type: "user" });

  const invitePage = await (await app.request(`/invites/${userToken}`)).text();
  const registerPage = await (await app.request(`/register?inviteToken=${userToken}&username=alice`)).text();

  for (const html of [invitePage, registerPage]) {
    if (html.includes("device invite") || html.includes("Create device invite")) {
      throw new Error("found legacy enroll wording");
    }
  }
});

Deno.test("GET /invites/:token is public for valid user invites", async () => {
  const { app, seedInvite } = await createTestApp();
  const token = await seedInvite({ type: "user" });

  const res = await app.request(`/invites/${token}`);
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
});

Deno.test("POST /invites/user redirects unauthenticated access to /login", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/invites/user", {
    method: "POST",
    redirect: "manual",
  });
  if (res.status !== 302) throw new Error(`expected 302, got ${res.status}`);
  if (res.headers.get("location") !== "/login") {
    throw new Error(
      `expected redirect to /login, got ${res.headers.get("location")}`,
    );
  }
});

Deno.test("POST /enroll/passkey redirects unauthenticated access to /login", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/enroll/passkey", {
    method: "POST",
    redirect: "manual",
  });

  if (res.status !== 302) throw new Error(`expected 302, got ${res.status}`);
  if (res.headers.get("location") !== "/login") {
    throw new Error(
      `expected redirect to /login, got ${res.headers.get("location")}`,
    );
  }
});

Deno.test("authenticated user can create a user invite and is redirected to canonical invite url", async () => {
  const { app, seedUserWithPasskey, getInvite } = await createTestApp();
  const alice = await seedUserWithPasskey("alice");

  const loginRes = await app.request("/test/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: alice.userId }),
  });
  if (loginRes.status !== 200) {
    throw new Error(`expected 200, got ${loginRes.status}`);
  }
  const cookie = getCookie(loginRes);
  if (!cookie) throw new Error("missing auth cookie");

  const res = await app.request("/invites/user", {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  if (res.status !== 303) throw new Error(`expected 303, got ${res.status}`);

  const location = res.headers.get("location");
  if (!location?.startsWith("/invites/")) {
    throw new Error(`expected canonical invite url, got ${location}`);
  }
  const token = location.split("/").at(-1);
  if (!token) throw new Error("missing invite token");
  const invite = getInvite(token);
  if (!invite) throw new Error("invite not stored");
  if (invite.inviterUserId !== alice.userId) {
    throw new Error(
      `expected inviter ${alice.userId}, got ${invite.inviterUserId}`,
    );
  }
  if (invite.type !== "user") throw new Error(`expected user, got ${invite.type}`);
  const ttl = invite.expiresAt - Date.now();
  if (ttl < 23 * 60 * 60 * 1000 || ttl > 24 * 60 * 60 * 1000 + 5_000) {
    throw new Error(`unexpected invite ttl: ${ttl}`);
  }
});

Deno.test("authenticated user can create an enrollment and is redirected to canonical enroll url", async () => {
  const { app, seedUserWithPasskey, getInvite } = await createTestApp();
  const alice = await seedUserWithPasskey("alice");

  const loginRes = await app.request("/test/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: alice.userId }),
  });
  const cookie = getCookie(loginRes);
  if (!cookie) throw new Error("missing auth cookie");

  const res = await app.request("/enroll/passkey", {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  if (res.status !== 303) throw new Error(`expected 303, got ${res.status}`);

  const location = res.headers.get("location");
  if (!location?.startsWith("/enroll/passkey/")) {
    throw new Error(`expected canonical enroll url, got ${location}`);
  }

  const token = location.split("/").at(-1);
  if (!token) throw new Error("missing invite token");
  const invite = getInvite(token);
  if (!invite) throw new Error("invite not stored");
  if (invite.type !== "device") {
    throw new Error(`expected device, got ${invite.type}`);
  }
  if (invite.inviterUserId !== alice.userId) {
    throw new Error("wrong inviter");
  }
  if (invite.targetUserId !== alice.userId) {
    throw new Error("wrong target user");
  }
});

Deno.test("GET /invites/:token renders public user invite page only for user tokens", async () => {
  const { app, seedInvite } = await createTestApp();
  const token = await seedInvite({ type: "user" });

  const res = await app.request(`/invites/${token}`);
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

  const html = await res.text();
  if (!html.includes("You’ve been invited") && !html.includes("You've been invited")) {
    throw new Error("missing invite heading");
  }
  if (html.includes("Enroll passkey")) {
    throw new Error("should not render enroll wording on user invite page");
  }
});
