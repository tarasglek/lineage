import { type Context, Hono } from "@hono/hono";
import { server as webauthnServer } from "@passwordless-id/webauthn";
import {
  isJwtExpiredError,
  signAuthSessionToken,
  signFlowToken,
  verifyAuthSessionToken,
  verifyFlowToken,
} from "./auth/jwt.ts";
import type { PasskeyStorage } from "./passkey_storage.ts";
import { renderQrSvg } from "./qr.ts";
import {
  accountPage,
  enrollPasskeyPage,
  landingPage,
  loginPage,
  loginPasskeyPage,
  publicInvitePage,
  registerPage,
} from "./views/pages.ts";

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

function coseAlgorithmToNumber(algorithm: string | number) {
  if (typeof algorithm === "number") return algorithm;
  switch (algorithm) {
    case "ES256":
      return -7;
    case "RS256":
      return -257;
    case "EdDSA":
      return -8;
    default:
      throw new Error(`unsupported_algorithm:${algorithm}`);
  }
}

function numberToNamedAlgorithm(algorithm: number) {
  switch (algorithm) {
    case -7:
      return "ES256" as const;
    case -257:
      return "RS256" as const;
    case -8:
      return "EdDSA" as const;
    default:
      throw new Error(`unsupported_algorithm:${algorithm}`);
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return atob(padded);
}

function parseCookieHeader(cookieHeader: string | null) {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    cookies.set(name, rest.join("="));
  }
  return cookies;
}

function getRequestWebAuthnContext(c: Context) {
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]
    ?.trim();
  const forwardedHost = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = c.req.header("host")?.split(",")[0]?.trim();
  const proto = forwardedProto || "http";
  const host = forwardedHost || hostHeader || "localhost";
  const rpId = host.replace(/:\d+$/, "");
  return {
    proto,
    host,
    rpId,
    origin: `${proto}://${host}`,
    isSecure: proto === "https",
  };
}

function authCookieValue(token: string, secure = false) {
  return `auth=${token}; HttpOnly; Path=/; SameSite=Lax${
    secure ? "; Secure" : ""
  }`;
}

function clearedAuthCookieValue(secure = false) {
  return `auth=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${
    secure ? "; Secure" : ""
  }`;
}

async function getAuthenticatedUser(c: Context, storage: PasskeyStorage) {
  const cookies = parseCookieHeader(c.req.header("cookie") ?? null);
  const token = cookies.get("auth");
  if (!token) return null;

  try {
    const payload = await verifyAuthSessionToken(token);
    const user = storage.getUser(payload.userId);
    if (!user) return null;
    return user;
  } catch {
    return null;
  }
}

function authErrorResponse(c: Context, event = "auth_missing_or_invalid") {
  logAuthDiagnostic({
    event,
    host: getRequestWebAuthnContext(c).host,
  });
  return c.redirect("/login", 302);
}

function staticAsset(path: string, _contentType: string) {
  return Deno.readTextFileSync(new URL(path, import.meta.url));
}

function logAuthDiagnostic(input: Record<string, unknown>) {
  console.log(JSON.stringify({
    type: "auth-diagnostic",
    time: new Date().toISOString(),
    cwd: Deno.cwd(),
    ...input,
  }));
}

function storageSnapshot(storage: PasskeyStorage) {
  return {
    userCount: storage.listUsers().length,
    credentialCount: storage.listCredentials().length,
    inviteCount: storage.listInvites().length,
    sessionCount: storage.listSessions().length,
  };
}

export function createPasskeyApp(storage: PasskeyStorage) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store, max-age=0");
    c.header("pragma", "no-cache");
    c.header("expires", "0");
  });

  app.get("/static/style.css", (c) => {
    return c.text(
      staticAsset("../static/style.css", "text/css; charset=utf-8"),
      200,
      {
        "content-type": "text/css; charset=utf-8",
      },
    );
  });
  app.get("/static/passkey-shared.js", (c) => {
    return c.text(
      staticAsset(
        "../static/passkey-shared.js",
        "application/javascript; charset=utf-8",
      ),
      200,
      {
        "content-type": "application/javascript; charset=utf-8",
      },
    );
  });
  app.get("/static/passkey-register.js", (c) => {
    return c.text(
      staticAsset(
        "../static/passkey-register.js",
        "application/javascript; charset=utf-8",
      ),
      200,
      {
        "content-type": "application/javascript; charset=utf-8",
      },
    );
  });
  app.get("/static/passkey-login.js", (c) => {
    return c.text(
      staticAsset(
        "../static/passkey-login.js",
        "application/javascript; charset=utf-8",
      ),
      200,
      {
        "content-type": "application/javascript; charset=utf-8",
      },
    );
  });
  app.get("/static/passkey-enroll.js", (c) => {
    return c.text(
      staticAsset(
        "../static/passkey-enroll.js",
        "application/javascript; charset=utf-8",
      ),
      200,
      {
        "content-type": "application/javascript; charset=utf-8",
      },
    );
  });

  app.post("/test/login", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    const userId = body?.userId;
    if (!userId) return c.json({ error: "missing_user_id" }, 400);
    const user = storage.getUser(userId);
    if (!user) return c.json({ error: "user_not_found" }, 404);

    const token = await signAuthSessionToken({
      userId: user.id,
      username: user.username,
    });
    c.header(
      "set-cookie",
      authCookieValue(token, getRequestWebAuthnContext(c).isSecure),
    );
    return c.json({ userId: user.id, username: user.username });
  });

  app.get("/", async (c) => {
    const currentUser = await getAuthenticatedUser(c, storage);
    return c.html(landingPage(currentUser));
  });

  app.get("/login", (c) => c.html(loginPage()));

  app.post("/login", async (c) => {
    const form = await c.req.formData();
    const username = String(form.get("username") ?? "");
    return c.redirect(
      `/login/passkey?username=${encodeURIComponent(username)}`,
      303,
    );
  });

  app.get("/login/passkey", (c) => {
    const username = c.req.query("username") ?? "";
    return c.html(loginPasskeyPage(username));
  });

  app.post("/logout", (c) => {
    c.header(
      "set-cookie",
      clearedAuthCookieValue(getRequestWebAuthnContext(c).isSecure),
    );
    return c.redirect("/login", 303);
  });

  app.get("/register", (c) => {
    const inviteToken = c.req.query("inviteToken") ?? "";
    const username = c.req.query("username") ?? "";
    return c.html(registerPage(inviteToken, username));
  });

  app.get("/invites/:token", (c) => {
    const token = c.req.param("token");
    const ctx = getRequestWebAuthnContext(c);
    const invite = storage.getInvite(token);
    if (!invite || invite.type !== "user") {
      logAuthDiagnostic({
        event: "invite_resource_not_found",
        host: ctx.host,
        inviteToken: token,
        inviteFound: Boolean(invite),
        inviteType: invite?.type,
        ...storageSnapshot(storage),
      });
      return c.html("<!doctype html><html><body>not found</body></html>", 404);
    }
    const inviteUrl = new URL(`/invites/${encodeURIComponent(token)}`, ctx.origin);
    logAuthDiagnostic({
      event: "invite_resource_rendered",
      host: ctx.host,
      inviteToken: token,
      inviteType: invite.type,
      ...storageSnapshot(storage),
    });
    return c.html(publicInvitePage(token, inviteUrl.toString()));
  });

  app.get("/enroll/passkey/:token", (c) => {
    const token = c.req.param("token");
    const ctx = getRequestWebAuthnContext(c);
    const invite = storage.getInvite(token);
    if (!invite || invite.type !== "device") {
      logAuthDiagnostic({
        event: "enroll_resource_not_found",
        host: ctx.host,
        inviteToken: token,
        inviteFound: Boolean(invite),
        inviteType: invite?.type,
        ...storageSnapshot(storage),
      });
      return c.html("<!doctype html><html><body>not found</body></html>", 404);
    }
    const inviteUrl = new URL(`/enroll/passkey/${encodeURIComponent(token)}`, ctx.origin);
    logAuthDiagnostic({
      event: "enroll_resource_rendered",
      host: ctx.host,
      inviteToken: token,
      inviteType: invite.type,
      ...storageSnapshot(storage),
    });
    return c.html(enrollPasskeyPage({
      token,
      inviteUrl: inviteUrl.toString(),
      qrSvg: renderQrSvg(inviteUrl.toString()),
    }));
  });

  app.post("/register", async (c) => {
    const form = await c.req.formData();
    const inviteToken = String(form.get("inviteToken") ?? "");
    const username = String(form.get("username") ?? "");
    return c.redirect(
      `/register?inviteToken=${encodeURIComponent(inviteToken)}&username=${
        encodeURIComponent(username)
      }`,
      303,
    );
  });

  app.get("/register/passkey", (c) => {
    const inviteToken = c.req.query("inviteToken") ?? "";
    const username = c.req.query("username") ?? "";
    return c.redirect(
      `/register?inviteToken=${encodeURIComponent(inviteToken)}&username=${
        encodeURIComponent(username)
      }`,
      303,
    );
  });

  app.post("/invites/user", async (c) => {
    const currentUser = await getAuthenticatedUser(c, storage);
    if (!currentUser) return authErrorResponse(c, "invite_user_auth_missing_or_invalid");

    const token = crypto.randomUUID();
    storage.putInvite({
      token,
      type: "user",
      inviterUserId: currentUser.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      usedAt: null,
    });

    logAuthDiagnostic({
      event: "invite_user_created",
      host: getRequestWebAuthnContext(c).host,
      inviteToken: token,
      userId: currentUser.id,
      username: currentUser.username,
      ...storageSnapshot(storage),
    });

    return c.redirect(`/invites/${encodeURIComponent(token)}`, 303);
  });

  app.post("/enroll/passkey", async (c) => {
    const currentUser = await getAuthenticatedUser(c, storage);
    if (!currentUser) return authErrorResponse(c, "enroll_passkey_auth_missing_or_invalid");

    const token = crypto.randomUUID();
    storage.putInvite({
      token,
      type: "device",
      inviterUserId: currentUser.id,
      targetUserId: currentUser.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      usedAt: null,
    });

    logAuthDiagnostic({
      event: "enroll_created",
      host: getRequestWebAuthnContext(c).host,
      inviteToken: token,
      userId: currentUser.id,
      username: currentUser.username,
      ...storageSnapshot(storage),
    });

    return c.redirect(`/enroll/passkey/${encodeURIComponent(token)}`, 303);
  });

  app.get("/account", async (c) => {
    const currentUser = await getAuthenticatedUser(c, storage);
    if (!currentUser) return authErrorResponse(c, "account_auth_missing_or_invalid");

    const origin = getRequestWebAuthnContext(c).origin;
    const invitedBy = currentUser.invitedBy ?? "";
    const now = Date.now();
    const invites = storage.listInvites().filter((invite) =>
      invite.inviterUserId === currentUser.id && invite.type === "user"
    );
    const deviceInvites = storage.listInvites().filter((invite) =>
      invite.type === "device" &&
      invite.inviterUserId === currentUser.id &&
      invite.targetUserId === currentUser.id &&
      invite.expiresAt > now
    );
    const credentials = storage.listCredentials().filter((credential) =>
      credential.userId === currentUser.id
    );

    logAuthDiagnostic({
      event: "account_view_success",
      host: getRequestWebAuthnContext(c).host,
      userId: currentUser.id,
      username: currentUser.username,
      ...storageSnapshot(storage),
    });

    return c.html(accountPage({
      username: currentUser.username,
      userId: currentUser.id,
      invitedBy,
      credentials: credentials.map((credential) => credential.id),
      deviceInvites: deviceInvites.map((invite) => ({
        token: invite.token,
        inviteUrl: `${origin}/enroll/passkey/${encodeURIComponent(invite.token)}`,
      })),
      invites: invites.map((invite) => ({
        token: invite.token,
        type: invite.type,
        label: invite.label,
      })),
    }));
  });

  app.post("/register/begin", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    const inviteToken = body?.inviteToken;
    const username = body?.username;

    if (!inviteToken) return c.json({ error: "missing_invite_token" }, 400);
    if (!username) return c.json({ error: "missing_username" }, 400);

    const invite = storage.getInvite(inviteToken);
    if (!invite) return c.json({ error: "invite_not_found" }, 404);
    if (invite.type !== "user") return c.json({ error: "wrong_invite_type" }, 409);
    if (invite.usedAt) return c.json({ error: "invite_already_used" }, 409);
    if (invite.expiresAt <= Date.now()) {
      return c.json({ error: "invite_expired" }, 410);
    }

    const webauthn = getRequestWebAuthnContext(c);
    const challenge = encodeBase64Url(crypto.randomUUID());
    const userId = crypto.randomUUID();
    const flowToken = await signFlowToken({
      flowType: "register",
      challenge,
      username,
      inviteToken,
      userId,
    });

    return c.json({
      challenge,
      flowToken,
      rp: { id: webauthn.rpId, name: "Lineage invite-network" },
      user: {
        id: userId,
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 60000,
      attestation: "none",
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });
  });

  app.post("/enroll/passkey/begin", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    const inviteToken = body?.inviteToken;
    if (!inviteToken) return c.json({ error: "missing_invite_token" }, 400);

    const invite = storage.getInvite(inviteToken);
    if (!invite) return c.json({ error: "invite_not_found" }, 404);
    if (invite.type !== "device") return c.json({ error: "wrong_invite_type" }, 409);
    if (invite.usedAt) return c.json({ error: "invite_already_used" }, 409);
    if (invite.expiresAt <= Date.now()) {
      return c.json({ error: "invite_expired" }, 410);
    }
    if (!invite.targetUserId) {
      return c.json({ error: "invite_missing_target_user" }, 400);
    }
    const user = storage.getUser(invite.targetUserId);
    if (!user) return c.json({ error: "device_invite_user_not_found" }, 404);

    const webauthn = getRequestWebAuthnContext(c);
    const challenge = encodeBase64Url(crypto.randomUUID());
    const flowToken = await signFlowToken({
      flowType: "register",
      challenge,
      username: user.username,
      inviteToken,
      userId: user.id,
    });

    return c.json({
      challenge,
      flowToken,
      rp: { id: webauthn.rpId, name: "Lineage invite-network" },
      user: {
        id: user.id,
        name: user.username,
        displayName: user.username,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 60000,
      attestation: "none",
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });
  });

  app.post("/register/complete", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    logAuthDiagnostic({
      event: "register_complete_begin",
      host: getRequestWebAuthnContext(c).host,
      credentialId: body?.id ? String(body.id) : undefined,
      ...storageSnapshot(storage),
    });

    const flowToken = body?.flowToken;
    if (!flowToken) return c.json({ error: "missing_flow_token" }, 400);

    const clientDataJSON = body?.response?.clientDataJSON;
    const attestationObject = body?.response?.attestationObject;
    if (!clientDataJSON || !attestationObject) {
      return c.json({ error: "invalid_attestation" }, 400);
    }

    let flow;
    try {
      flow = await verifyFlowToken(flowToken, "register");
    } catch (error) {
      if (isJwtExpiredError(error)) {
        return c.json({ error: "flow_token_expired" }, 400);
      }
      return c.json({ error: "invalid_flow_token" }, 400);
    }

    const clientData = JSON.parse(decodeBase64Url(clientDataJSON));
    if (clientData?.challenge !== flow.challenge) {
      return c.json({ error: "registration_session_not_found" }, 400);
    }

    const webauthn = getRequestWebAuthnContext(c);
    const invite = flow.inviteToken
      ? storage.getInvite(flow.inviteToken)
      : undefined;
    logAuthDiagnostic({
      event: "register_complete_flow_verified",
      host: webauthn.host,
      credentialId: body?.id ? String(body.id) : undefined,
      userId: flow.userId,
      username: flow.username,
      inviteToken: flow.inviteToken,
      inviteFound: Boolean(invite),
      inviteType: invite?.type,
      inviteUsedAt: invite?.usedAt ?? null,
      ...storageSnapshot(storage),
    });
    if (!invite || invite.usedAt) {
      return c.json({ error: "invite_already_used" }, 409);
    }
    if (invite.type !== "user") {
      return c.json({ error: "wrong_invite_type" }, 409);
    }

    if (
      !body?.response?.authenticatorData ||
      !body?.response?.publicKey ||
      typeof body?.response?.publicKeyAlgorithm === "undefined"
    ) {
      return c.json({ error: "invalid_attestation" }, 400);
    }

    let credentialRecord;
    try {
      const info = await webauthnServer.verifyRegistration({
        id: body.id,
        rawId: body.rawId,
        type: body.type,
        authenticatorAttachment: body.authenticatorAttachment,
        clientExtensionResults: body.clientExtensionResults ?? {},
        response: {
          attestationObject,
          authenticatorData: body.response.authenticatorData,
          clientDataJSON,
          publicKey: body.response.publicKey,
          publicKeyAlgorithm: body.response.publicKeyAlgorithm,
          transports: body.response.transports ?? [],
        },
        user: {
          id: flow.userId,
          name: flow.username,
          displayName: flow.username,
        },
      }, {
        challenge: flow.challenge,
        origin: webauthn.origin,
        domain: webauthn.rpId,
      });
      credentialRecord = {
        id: body.id,
        publicKey: info.credential.publicKey,
        algorithm: coseAlgorithmToNumber(info.credential.algorithm),
        signCount: info.authenticator.counter,
        userId: flow.userId,
        transports: info.credential.transports,
      };
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      if (message.includes("origin")) {
        return c.json({ error: "origin_mismatch" }, 400);
      }
      if (message.includes("RpIdHash")) {
        return c.json({ error: "rp_id_mismatch" }, 400);
      }
      return c.json({ error: "invalid_attestation" }, 400);
    }

    try {
      storage.transaction(() => {
        if (invite.type === "user") {
          const existingByUsername = storage.findUserByUsername(flow.username);
          if (existingByUsername && existingByUsername.id !== flow.userId) {
            throw new Error("username_taken");
          }
          storage.putUser({
            id: flow.userId,
            username: flow.username,
            invitedBy: invite.inviterUserId,
          });
        } else if (!storage.getUser(flow.userId)) {
          throw new Error("device_invite_user_not_found");
        }

        storage.putCredential(credentialRecord);
        storage.putInvite({ ...invite, usedAt: Date.now() });
      });
      logAuthDiagnostic({
        event: "register_complete_persisted",
        host: webauthn.host,
        credentialId: credentialRecord.id,
        userId: flow.userId,
        username: flow.username,
        inviteToken: flow.inviteToken,
        ...storageSnapshot(storage),
      });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      logAuthDiagnostic({
        event: "register_complete_error",
        host: webauthn.host,
        credentialId: body?.id ? String(body.id) : undefined,
        userId: flow.userId,
        username: flow.username,
        inviteToken: flow.inviteToken,
        error: message,
        ...storageSnapshot(storage),
      });
      if (message === "username_taken") {
        return c.json({ error: "username_taken" }, 409);
      }
      if (message === "device_invite_user_not_found") {
        return c.json({ error: "device_invite_user_not_found" }, 404);
      }
      throw error;
    }

    logAuthDiagnostic({
      event: "register_complete_success",
      host: webauthn.host,
      credentialId: body.id,
      userId: flow.userId,
      username: flow.username,
      inviteToken: flow.inviteToken,
      ...storageSnapshot(storage),
    });

    const authToken = await signAuthSessionToken({
      userId: flow.userId,
      username: flow.username,
    });
    c.header("set-cookie", authCookieValue(authToken, webauthn.isSecure));
    return c.json({
      credentialId: body.id,
      userId: flow.userId,
      username: flow.username,
    });
  });

  app.post("/enroll/passkey/complete", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    logAuthDiagnostic({
      event: "enroll_complete_begin",
      host: getRequestWebAuthnContext(c).host,
      credentialId: body?.id ? String(body.id) : undefined,
      ...storageSnapshot(storage),
    });

    const flowToken = body?.flowToken;
    if (!flowToken) return c.json({ error: "missing_flow_token" }, 400);

    const clientDataJSON = body?.response?.clientDataJSON;
    const attestationObject = body?.response?.attestationObject;
    if (!clientDataJSON || !attestationObject) {
      return c.json({ error: "invalid_attestation" }, 400);
    }

    let flow;
    try {
      flow = await verifyFlowToken(flowToken, "register");
    } catch (error) {
      if (isJwtExpiredError(error)) {
        return c.json({ error: "flow_token_expired" }, 400);
      }
      return c.json({ error: "invalid_flow_token" }, 400);
    }

    const clientData = JSON.parse(decodeBase64Url(clientDataJSON));
    if (clientData?.challenge !== flow.challenge) {
      return c.json({ error: "registration_session_not_found" }, 400);
    }

    const webauthn = getRequestWebAuthnContext(c);
    const invite = flow.inviteToken
      ? storage.getInvite(flow.inviteToken)
      : undefined;
    logAuthDiagnostic({
      event: "enroll_complete_flow_verified",
      host: webauthn.host,
      credentialId: body?.id ? String(body.id) : undefined,
      userId: flow.userId,
      username: flow.username,
      inviteToken: flow.inviteToken,
      inviteFound: Boolean(invite),
      inviteType: invite?.type,
      inviteUsedAt: invite?.usedAt ?? null,
      ...storageSnapshot(storage),
    });
    if (!invite || invite.usedAt) {
      return c.json({ error: "invite_already_used" }, 409);
    }
    if (invite.type !== "device") {
      return c.json({ error: "wrong_invite_type" }, 409);
    }

    if (
      !body?.response?.authenticatorData ||
      !body?.response?.publicKey ||
      typeof body?.response?.publicKeyAlgorithm === "undefined"
    ) {
      return c.json({ error: "invalid_attestation" }, 400);
    }

    let credentialRecord;
    try {
      const info = await webauthnServer.verifyRegistration({
        id: body.id,
        rawId: body.rawId,
        type: body.type,
        authenticatorAttachment: body.authenticatorAttachment,
        clientExtensionResults: body.clientExtensionResults ?? {},
        response: {
          attestationObject,
          authenticatorData: body.response.authenticatorData,
          clientDataJSON,
          publicKey: body.response.publicKey,
          publicKeyAlgorithm: body.response.publicKeyAlgorithm,
          transports: body.response.transports ?? [],
        },
        user: {
          id: flow.userId,
          name: flow.username,
          displayName: flow.username,
        },
      }, {
        challenge: flow.challenge,
        origin: webauthn.origin,
        domain: webauthn.rpId,
      });
      credentialRecord = {
        id: body.id,
        publicKey: info.credential.publicKey,
        algorithm: coseAlgorithmToNumber(info.credential.algorithm),
        signCount: info.authenticator.counter,
        userId: flow.userId,
        transports: info.credential.transports,
      };
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      if (message.includes("origin")) {
        return c.json({ error: "origin_mismatch" }, 400);
      }
      if (message.includes("RpIdHash")) {
        return c.json({ error: "rp_id_mismatch" }, 400);
      }
      return c.json({ error: "invalid_attestation" }, 400);
    }

    try {
      storage.transaction(() => {
        if (!storage.getUser(flow.userId)) {
          throw new Error("device_invite_user_not_found");
        }
        storage.putCredential(credentialRecord);
        storage.putInvite({ ...invite, usedAt: Date.now() });
      });
      logAuthDiagnostic({
        event: "enroll_complete_persisted",
        host: webauthn.host,
        credentialId: credentialRecord.id,
        userId: flow.userId,
        username: flow.username,
        inviteToken: flow.inviteToken,
        ...storageSnapshot(storage),
      });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      logAuthDiagnostic({
        event: "enroll_complete_error",
        host: webauthn.host,
        credentialId: body?.id ? String(body.id) : undefined,
        userId: flow.userId,
        username: flow.username,
        inviteToken: flow.inviteToken,
        error: message,
        ...storageSnapshot(storage),
      });
      if (message === "device_invite_user_not_found") {
        return c.json({ error: "device_invite_user_not_found" }, 404);
      }
      throw error;
    }

    logAuthDiagnostic({
      event: "enroll_complete_success",
      host: webauthn.host,
      credentialId: body.id,
      userId: flow.userId,
      username: flow.username,
      inviteToken: flow.inviteToken,
      ...storageSnapshot(storage),
    });

    const authToken = await signAuthSessionToken({
      userId: flow.userId,
      username: flow.username,
    });
    c.header("set-cookie", authCookieValue(authToken, webauthn.isSecure));
    return c.json({
      credentialId: body.id,
      userId: flow.userId,
      username: flow.username,
    });
  });

  app.post("/login/begin", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    const username = body?.username ? String(body.username) : "";
    const webauthn = getRequestWebAuthnContext(c);
    const challenge = encodeBase64Url(crypto.randomUUID());

    logAuthDiagnostic({
      event: "login_begin_start",
      host: webauthn.host,
      username: username || undefined,
      ...storageSnapshot(storage),
    });

    if (username) {
      const user = storage.findUserByUsername(username);
      logAuthDiagnostic({
        event: "login_begin_username_lookup",
        host: webauthn.host,
        username,
        userFound: Boolean(user),
        userId: user?.id,
        ...storageSnapshot(storage),
      });
      if (!user) return c.json({ error: "user_not_found" }, 404);

      const credentials = storage.listCredentials().filter((credential) =>
        credential.userId === user.id
      );
      logAuthDiagnostic({
        event: "login_begin_credentials_for_user",
        host: webauthn.host,
        username,
        userId: user.id,
        allowCredentialCount: credentials.length,
        allowCredentialIds: credentials.map((credential) => credential.id),
        ...storageSnapshot(storage),
      });
      const flowToken = await signFlowToken({
        flowType: "login",
        challenge,
        username,
        userId: user.id,
      });

      return c.json({
        challenge,
        flowToken,
        rpId: webauthn.rpId,
        timeout: 60000,
        userVerification: "preferred",
        allowCredentials: credentials.map((credential) => ({
          id: credential.id,
          type: "public-key",
          transports: credential.transports ?? ["internal"],
        })),
      });
    }

    logAuthDiagnostic({
      event: "login_begin_discoverable",
      host: webauthn.host,
      ...storageSnapshot(storage),
    });

    const flowToken = await signFlowToken({
      flowType: "login",
      challenge,
      username: "",
      userId: "",
    });

    return c.json({
      challenge,
      flowToken,
      rpId: webauthn.rpId,
      timeout: 60000,
      userVerification: "preferred",
    });
  });

  app.post("/login/complete", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    logAuthDiagnostic({
      event: "login_complete_begin",
      host: getRequestWebAuthnContext(c).host,
      credentialId: body?.id ? String(body.id) : undefined,
      ...storageSnapshot(storage),
    });

    const flowToken = body?.flowToken;
    if (!flowToken) {
      logAuthDiagnostic({
        event: "login_complete_missing_flow_token",
        host: getRequestWebAuthnContext(c).host,
        credentialId: body?.id ? String(body.id) : undefined,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "missing_flow_token" }, 400);
    }

    const clientDataJSON = body?.response?.clientDataJSON;
    const authenticatorData = body?.response?.authenticatorData;
    const signature = body?.response?.signature;
    const userHandle = body?.response?.userHandle;
    if (!clientDataJSON || !authenticatorData || !signature || !userHandle) {
      logAuthDiagnostic({
        event: "login_complete_invalid_assertion",
        host: getRequestWebAuthnContext(c).host,
        credentialId: body?.id ? String(body.id) : undefined,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "invalid_assertion" }, 400);
    }

    let flow;
    try {
      flow = await verifyFlowToken(flowToken, "login");
    } catch (error) {
      if (isJwtExpiredError(error)) {
        logAuthDiagnostic({
          event: "login_complete_flow_token_expired",
          host: getRequestWebAuthnContext(c).host,
          credentialId: body?.id ? String(body.id) : undefined,
          ...storageSnapshot(storage),
        });
        return c.json({ error: "flow_token_expired" }, 400);
      }
      logAuthDiagnostic({
        event: "login_complete_invalid_flow_token",
        host: getRequestWebAuthnContext(c).host,
        credentialId: body?.id ? String(body.id) : undefined,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "invalid_flow_token" }, 400);
    }

    const clientData = JSON.parse(decodeBase64Url(clientDataJSON));
    const webauthn = getRequestWebAuthnContext(c);
    if (clientData?.challenge !== flow.challenge) {
      logAuthDiagnostic({
        event: "login_complete_authentication_session_not_found",
        host: webauthn.host,
        credentialId: body?.id ? String(body.id) : undefined,
        flowUserId: flow.userId,
        flowUsername: flow.username,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "authentication_session_not_found" }, 400);
    }
    if (clientData.origin !== webauthn.origin) {
      logAuthDiagnostic({
        event: "login_complete_origin_mismatch",
        host: webauthn.host,
        credentialId: body?.id ? String(body.id) : undefined,
        flowUserId: flow.userId,
        flowUsername: flow.username,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "origin_mismatch" }, 400);
    }

    const credential = storage.getCredential(body.id);
    logAuthDiagnostic({
      event: "login_complete_credential_lookup",
      host: webauthn.host,
      credentialId: body.id,
      credentialFound: Boolean(credential),
      credentialUserId: credential?.userId,
      credentialSignCount: credential?.signCount,
      flowUserId: flow.userId,
      flowUsername: flow.username,
      ...storageSnapshot(storage),
    });
    if (!credential) {
      logAuthDiagnostic({
        event: "login_complete_credential_not_found",
        host: webauthn.host,
        credentialId: body.id,
        flowUserId: flow.userId,
        flowUsername: flow.username,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "credential_not_found" }, 404);
    }
    if (!credential.publicKey) {
      logAuthDiagnostic({
        event: "login_complete_credential_missing_public_key",
        host: webauthn.host,
        credentialId: credential.id,
        credentialUserId: credential.userId,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "credential_missing_public_key" }, 400);
    }
    let authInfo;
    try {
      authInfo = await webauthnServer.verifyAuthentication({
        id: body.id,
        rawId: body.rawId,
        type: body.type,
        authenticatorAttachment: body.authenticatorAttachment,
        clientExtensionResults: body.clientExtensionResults ?? {},
        response: {
          clientDataJSON,
          authenticatorData,
          signature,
          userHandle,
        },
      }, {
        id: credential.id,
        publicKey: credential.publicKey,
        algorithm: numberToNamedAlgorithm(credential.algorithm),
        transports: credential.transports ?? ["internal"],
      }, {
        challenge: flow.challenge,
        origin: webauthn.origin,
        domain: webauthn.rpId,
        userVerified: false,
        counter: credential.signCount,
      });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      if (message.includes("unsupported_algorithm")) {
        logAuthDiagnostic({
          event: "login_complete_credential_missing_public_key",
          host: webauthn.host,
          credentialId: credential.id,
          credentialUserId: credential.userId,
          credentialAlgorithm: credential.algorithm,
          ...storageSnapshot(storage),
        });
        return c.json({ error: "credential_missing_public_key" }, 400);
      }
      if (message.includes("RpIdHash")) {
        logAuthDiagnostic({
          event: "login_complete_rp_id_mismatch",
          host: webauthn.host,
          credentialId: credential.id,
          credentialUserId: credential.userId,
          ...storageSnapshot(storage),
        });
        return c.json({ error: "rp_id_mismatch" }, 400);
      }
      if (message.includes("counter")) {
        logAuthDiagnostic({
          event: "login_complete_sign_count_rollback",
          host: webauthn.host,
          credentialId: credential.id,
          credentialUserId: credential.userId,
          credentialSignCount: credential.signCount,
          ...storageSnapshot(storage),
        });
        return c.json({ error: "sign_count_rollback" }, 400);
      }
      if (message.includes("Invalid signature")) {
        logAuthDiagnostic({
          event: "login_complete_invalid_signature",
          host: webauthn.host,
          credentialId: credential.id,
          credentialUserId: credential.userId,
          ...storageSnapshot(storage),
        });
        return c.json({ error: "invalid_signature" }, 400);
      }
      if (message.includes("challenge")) {
        logAuthDiagnostic({
          event: "login_complete_authentication_session_not_found",
          host: webauthn.host,
          credentialId: body?.id ? String(body.id) : undefined,
          flowUserId: flow.userId,
          flowUsername: flow.username,
          ...storageSnapshot(storage),
        });
        return c.json({ error: "authentication_session_not_found" }, 400);
      }
      if (message.includes("origin")) {
        logAuthDiagnostic({
          event: "login_complete_origin_mismatch",
          host: webauthn.host,
          credentialId: body?.id ? String(body.id) : undefined,
          flowUserId: flow.userId,
          flowUsername: flow.username,
          ...storageSnapshot(storage),
        });
        return c.json({ error: "origin_mismatch" }, 400);
      }
      logAuthDiagnostic({
        event: "login_complete_invalid_assertion",
        host: webauthn.host,
        credentialId: body?.id ? String(body.id) : undefined,
        error: message,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "invalid_assertion" }, 400);
    }

    if (decodeBase64Url(userHandle) !== credential.userId) {
      logAuthDiagnostic({
        event: "login_complete_user_handle_mismatch",
        host: webauthn.host,
        credentialId: credential.id,
        credentialUserId: credential.userId,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "user_handle_mismatch" }, 403);
    }
    if (flow.userId && credential.userId !== flow.userId) {
      logAuthDiagnostic({
        event: "login_complete_credential_not_owned_by_user",
        host: webauthn.host,
        credentialId: credential.id,
        credentialUserId: credential.userId,
        flowUserId: flow.userId,
        flowUsername: flow.username,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "credential_not_owned_by_user" }, 403);
    }

    const user = storage.getUser(credential.userId);
    logAuthDiagnostic({
      event: "login_complete_user_lookup",
      host: webauthn.host,
      credentialId: credential.id,
      credentialUserId: credential.userId,
      userFound: Boolean(user),
      userId: user?.id,
      username: user?.username,
      ...storageSnapshot(storage),
    });
    if (!user) {
      logAuthDiagnostic({
        event: "login_complete_user_not_found",
        host: webauthn.host,
        credentialId: credential.id,
        credentialUserId: credential.userId,
        ...storageSnapshot(storage),
      });
      return c.json({ error: "user_not_found" }, 404);
    }

    storage.putCredential({ ...credential, signCount: authInfo.counter });
    storage.recordSession({ userId: credential.userId, createdAt: Date.now() });

    logAuthDiagnostic({
      event: "login_complete_success",
      host: webauthn.host,
      credentialId: credential.id,
      userId: user.id,
      username: user.username,
      signCount: authInfo.counter,
      ...storageSnapshot(storage),
    });

    const authToken = await signAuthSessionToken({
      userId: user.id,
      username: user.username,
    });
    c.header("set-cookie", authCookieValue(authToken, webauthn.isSecure));
    return c.json({
      credentialId: credential.id,
      userId: user.id,
      username: user.username,
    });
  });

  return app;
}
