import { createTestApp } from "../helpers/test_app.ts";

Deno.test("GET /login renders passkey-first sign-in page", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/login");

  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const html = await res.text();
  if (!html.includes("Sign in with passkey")) {
    throw new Error("missing passkey-first sign-in action");
  }
  if (html.includes('name="username"')) {
    throw new Error("login page should not require username entry");
  }
  if (!html.includes('src="/static/passkey-login.js?time=')) {
    throw new Error("missing external login script");
  }
  if (!html.includes('src="/static/passkey-shared.js?time=')) {
    throw new Error("missing shared passkey script");
  }
});

Deno.test("GET /login/passkey renders usable passkey login page", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/login/passkey");

  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const html = await res.text();
  if (!html.includes("Sign in with passkey")) {
    throw new Error("missing passkey action button");
  }
  if (!html.includes('id="status"')) {
    throw new Error("missing status box");
  }
  if (html.includes('name="username"')) {
    throw new Error("passkey login page should not ask for username");
  }
  if (!html.includes('src="/static/passkey-login.js?time=')) {
    throw new Error("missing external login script");
  }
  if (!html.includes('src="/static/passkey-shared.js?time=')) {
    throw new Error("missing shared passkey script");
  }
});

Deno.test("POST /logout clears auth cookie", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const alice = await seedUserWithPasskey("alice");

  const loginRes = await app.request("/test/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: alice.userId }),
  });
  const authCookie = loginRes.headers.get("set-cookie");
  if (!authCookie) throw new Error("missing auth cookie");

  const res = await app.request("/logout", {
    method: "POST",
    headers: { cookie: authCookie },
    redirect: "manual",
  });

  if (res.status !== 303) throw new Error(`expected 303, got ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  if (!setCookie.includes("auth=;")) {
    throw new Error("expected cleared auth cookie");
  }
});

Deno.test("protected SSR pages redirect to /login", async () => {
  const { app } = await createTestApp();

  const cases = [
    { path: "/account", method: "GET" },
    { path: "/invites/user", method: "POST" },
    { path: "/enroll/passkey", method: "POST" },
  ] as const;

  for (const testCase of cases) {
    const res = await app.request(testCase.path, {
      method: testCase.method,
      redirect: "manual",
    });
    if (res.status !== 302) {
      throw new Error(`expected 302 for ${testCase.path}, got ${res.status}`);
    }
    if (res.headers.get("location") !== "/login") {
      throw new Error(
        `expected redirect to /login for ${testCase.path}, got ${
          res.headers.get("location")
        }`,
      );
    }
  }
});
