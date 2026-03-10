import { createMainPasskeyApp } from "../main.ts";

const baseUrl = Deno.args[0] ?? "http://localhost:8000";
const dbPath = "./data/users.sqlite";

await Deno.remove(dbPath).catch(() => undefined);

const app = await createMainPasskeyApp(dbPath);
try {
  const url = new URL("/register", baseUrl);
  url.searchParams.set("inviteToken", app.bootstrapInviteToken);
  console.log(url.toString());
} finally {
  app.storage.close();
}
