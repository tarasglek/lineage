import { createMainPasskeyApp } from "../main.ts";

const args = Deno.args.filter((arg) => arg !== "--");
const baseUrl = args[0] ?? "http://localhost:8000";
const app = await createMainPasskeyApp();

try {
  const url = new URL("/register", baseUrl);
  url.searchParams.set("inviteToken", app.bootstrapInviteToken);
  console.log(url.toString());
} finally {
  app.storage.close();
}
