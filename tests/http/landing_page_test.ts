import { createTestApp } from "../helpers/test_app.ts";

Deno.test("GET / renders useful landing page", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/");
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

  const html = await res.text();
  if (!html.includes("Lineage invite-network")) {
    throw new Error("missing app title");
  }
  if (!html.includes('href="/login"')) throw new Error("missing login link");
});
