import { Hono } from "@hono/hono";
import type { Context } from "@hono/hono";
import { logger } from "@hono/hono/logger";
import { serveDir } from "@std/http/file-server";
//import { emailRegexpChecker, getSecret, Locker } from "jsr:@tarasglek/locker"
const config = JSON.parse(await Deno.readTextFile("./config.json"));

let locker: typeof Locker | undefined;

const app = new Hono();

app.use("*", async (c, next) => {
  const host = c.req.header("x-forwarded-host");
  if (host) {
    if (!locker) {
      locker = await Locker.init({
        domain: host,
        secret: await getSecret(host + import.meta.url),
        oidc_issuer: "https://lastlogin.net/",
        checker: emailRegexpChecker(config.allowedEmails as string[]),
      });
    }
  }
  await next();
}).use(logger())
  .get("/logout", async (c) => {
    await locker!.revokeSession(c as Context);
    return c.html(
      `You have been successfully logged out! <a href="/">home</a>`,
    );
  })
  .use("*", (c, next) => locker!.oidcAuthMiddleware()(c, next))
  .use("*", (c, next) => locker!.check()(c, next))
  .get(
    "/*",
    (c) => {
      // this actually includes content-length unlike hono's serveStatic
      return serveDir(c.req.raw, {
        fsRoot: "dist",
      });
    },
  );

export default app;
