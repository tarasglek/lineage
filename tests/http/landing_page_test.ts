import { createTestApp } from "../helpers/test_app.ts";

Deno.test("GET / renders minimal signed-out identity home", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/");
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

  const html = await res.text();
  if (!html.includes("Lineage invite-network")) {
    throw new Error("missing app title");
  }
  if (!html.includes('href="/login"')) throw new Error("missing login link");
  if (!html.includes(">Sign in<")) throw new Error("missing sign in action");
  if (html.includes(">Register<")) {
    throw new Error("should not advertise public registration");
  }
  if (html.includes("First-time setup")) {
    throw new Error("should not foreground bootstrap setup on landing page");
  }
});
