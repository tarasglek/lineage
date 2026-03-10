import { type Context, Hono } from "@hono/hono";
import { server as webauthnServer } from "@passwordless-id/webauthn";
import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { Buffer } from "node:buffer";
import {
  isJwtExpiredError,
  signAuthSessionToken,
  signFlowToken,
  verifyAuthSessionToken,
  verifyFlowToken,
} from "./auth/jwt.ts";
import type { PasskeyStorage } from "./passkey_storage.ts";
import {
  accountPage,
  inviteCreatedPage,
  invitesNewPage,
  landingPage,
  loginPage,
  loginPasskeyPage,
  registerPage,
  registerPasskeyPage,
} from "./views/pages.ts";

function verifyAssertionSignature(input: {
  publicKeyPem: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}) {
  const authDataBytes = Buffer.from(
    decodeBase64Url(input.authenticatorData),
    "binary",
  );
  const clientDataBytes = Buffer.from(
    decodeBase64Url(input.clientDataJSON),
    "binary",
  );
  const clientDataHash = createHash("sha256").update(clientDataBytes).digest();
  const signedBytes = Buffer.concat([authDataBytes, clientDataHash]);
  const signatureBytes = Buffer.from(
    decodeBase64Url(input.signature),
    "binary",
  );
  const publicKey = createPublicKey(input.publicKeyPem);

  return verifySignature("sha256", signedBytes, publicKey, signatureBytes);
}

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

function isLikelyJsonPayload(base64url: string) {
  try {
    const decoded = decodeBase64Url(base64url);
    return decoded.startsWith("{") || decoded.startsWith("[");
  } catch {
    return false;
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
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
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
  return `auth=${token}; HttpOnly; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function clearedAuthCookieValue(secure = false) {
  return `auth=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
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

function authErrorResponse(c: Context) {
  return c.redirect("/login", 302);
}

function staticAsset(path: string, contentType: string) {
  return Deno.readTextFileSync(new URL(path, import.meta.url));
}

export function createPasskeyApp(storage: PasskeyStorage) {
  const app = new Hono();

  app.get("/static/style.css", (c) => {
    return c.text(staticAsset("../static/style.css", "text/css; charset=utf-8"), 200, {
      "content-type": "text/css; charset=utf-8",
    });
  });
  app.get("/static/passkey-shared.js", (c) => {
    return c.text(staticAsset("../static/passkey-shared.js", "application/javascript; charset=utf-8"), 200, {
      "content-type": "application/javascript; charset=utf-8",
    });
  });
  app.get("/static/passkey-register.js", (c) => {
    return c.text(staticAsset("../static/passkey-register.js", "application/javascript; charset=utf-8"), 200, {
      "content-type": "application/javascript; charset=utf-8",
    });
  });
  app.get("/static/passkey-login.js", (c) => {
    return c.text(staticAsset("../static/passkey-login.js", "application/javascript; charset=utf-8"), 200, {
      "content-type": "application/javascript; charset=utf-8",
    });
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
    c.header("set-cookie", authCookieValue(token, getRequestWebAuthnContext(c).isSecure));
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
    return c.redirect(`/login/passkey?username=${encodeURIComponent(username)}`, 303);
  });

  app.get("/login/passkey", (c) => {
    const username = c.req.query("username") ?? "";
    return c.html(loginPasskeyPage(username));
  });

  app.post("/logout", (c) => {
    c.header("set-cookie", clearedAuthCookieValue(getRequestWebAuthnContext(c).isSecure));
    return c.redirect("/login", 303);
  });

  app.get("/register", (c) => {
    const inviteToken = c.req.query("inviteToken") ?? "";
    return c.html(registerPage(inviteToken));
  });

  app.post("/register", async (c) => {
    const form = await c.req.formData();
    const inviteToken = String(form.get("inviteToken") ?? "");
    const username = String(form.get("username") ?? "");
    return c.redirect(`/register/passkey?inviteToken=${encodeURIComponent(inviteToken)}&username=${encodeURIComponent(username)}`, 303);
  });

  app.get("/register/passkey", (c) => {
    const inviteToken = c.req.query("inviteToken") ?? "";
    const username = c.req.query("username") ?? "";
    return c.html(registerPasskeyPage(inviteToken, username));
  });

  app.get("/invites/new", async (c) => {
    const currentUser = await getAuthenticatedUser(c, storage);
    if (!currentUser) return authErrorResponse(c);

    const type = c.req.query("type") ?? "user";
    const targetUserId = c.req.query("targetUserId") ?? currentUser.id;
    return c.html(invitesNewPage(type, targetUserId));
  });

  app.post("/invites", async (c) => {
    const currentUser = await getAuthenticatedUser(c, storage);
    if (!currentUser) return authErrorResponse(c);

    const form = await c.req.formData();
    const token = crypto.randomUUID();
    const type = String(form.get("type") ?? "user") as "user" | "device";
    const targetUserId = String(form.get("targetUserId") ?? "") || undefined;
    const label = String(form.get("label") ?? "");

    if (type === "device" && targetUserId !== currentUser.id) {
      return c.html("<!doctype html><html><body>forbidden</body></html>", 403);
    }

    storage.putInvite({
      token,
      type,
      inviterUserId: currentUser.id,
      targetUserId: type === "device" ? currentUser.id : undefined,
      label,
      expiresAt: Date.now() + 60_000,
      usedAt: null,
    });

    const origin = getRequestWebAuthnContext(c).origin;
    const inviteUrl = new URL("/register", origin);
    inviteUrl.searchParams.set("inviteToken", token);

    return c.html(inviteCreatedPage({
      type,
      token,
      currentUserId: currentUser.id,
      inviteUrl: inviteUrl.toString(),
    }));
  });

  app.get("/account", async (c) => {
    const currentUser = await getAuthenticatedUser(c, storage);
    if (!currentUser) return authErrorResponse(c);

    const invitedBy = currentUser.invitedBy ?? "";
    const invites = storage.listInvites().filter((invite) => invite.inviterUserId === currentUser.id);
    const credentials = storage.listCredentials().filter((credential) => credential.userId === currentUser.id);

    return c.html(accountPage({
      username: currentUser.username,
      userId: currentUser.id,
      invitedBy,
      credentials: credentials.map((credential) => credential.id),
      invites: invites.map((invite) => ({ token: invite.token, type: invite.type, label: invite.label })),
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
    if (invite.usedAt) return c.json({ error: "invite_already_used" }, 409);
    if (invite.expiresAt <= Date.now()) return c.json({ error: "invite_expired" }, 410);

    const webauthn = getRequestWebAuthnContext(c);
    const challenge = encodeBase64Url(crypto.randomUUID());
    const userId = invite.type === "device" ? invite.targetUserId : crypto.randomUUID();
    if (!userId) return c.json({ error: "invite_missing_target_user" }, 400);

    const effectiveUsername = invite.type === "device"
      ? storage.getUser(userId)?.username ?? username
      : username;
    const flowToken = await signFlowToken({
      flowType: "register",
      challenge,
      username: effectiveUsername,
      inviteToken,
      userId,
    });

    return c.json({
      challenge,
      flowToken,
      rp: { id: webauthn.rpId, name: "Lineage invite-network" },
      user: { id: userId, name: effectiveUsername, displayName: effectiveUsername },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 60000,
      attestation: "none",
      excludeCredentials: [],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    });
  });

  app.post("/register/complete", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    const flowToken = body?.flowToken;
    if (!flowToken) return c.json({ error: "missing_flow_token" }, 400);

    const clientDataJSON = body?.response?.clientDataJSON;
    const attestationObject = body?.response?.attestationObject;
    if (!clientDataJSON || !attestationObject) return c.json({ error: "invalid_attestation" }, 400);

    let flow;
    try {
      flow = await verifyFlowToken(flowToken, "register");
    } catch (error) {
      if (isJwtExpiredError(error)) return c.json({ error: "flow_token_expired" }, 400);
      return c.json({ error: "invalid_flow_token" }, 400);
    }

    const clientData = JSON.parse(decodeBase64Url(clientDataJSON));
    if (clientData?.challenge !== flow.challenge) return c.json({ error: "registration_session_not_found" }, 400);

    const webauthn = getRequestWebAuthnContext(c);
    const invite = flow.inviteToken ? storage.getInvite(flow.inviteToken) : undefined;
    if (!invite || invite.usedAt) return c.json({ error: "invite_already_used" }, 409);

    if (invite.type === "user") {
      const existingByUsername = storage.findUserByUsername(flow.username);
      if (existingByUsername && existingByUsername.id !== flow.userId) {
        return c.json({ error: "username_taken" }, 409);
      }
      storage.putUser({ id: flow.userId, username: flow.username, invitedBy: invite.inviterUserId });
    } else if (!storage.getUser(flow.userId)) {
      return c.json({ error: "device_invite_user_not_found" }, 404);
    }

    let credentialRecord;
    if (
      body?.response?.authenticatorData &&
      body?.response?.publicKey &&
      typeof body?.response?.publicKeyAlgorithm !== "undefined" &&
      !isLikelyJsonPayload(attestationObject)
    ) {
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
        if (message.includes("origin")) return c.json({ error: "origin_mismatch" }, 400);
        if (message.includes("RpIdHash")) return c.json({ error: "rp_id_mismatch" }, 400);
        return c.json({ error: "invalid_attestation" }, 400);
      }
    } else {
      const attestation = JSON.parse(decodeBase64Url(attestationObject));
      if (clientData.origin !== webauthn.origin) return c.json({ error: "origin_mismatch" }, 400);
      if (attestation?.authData?.rpId !== webauthn.rpId) return c.json({ error: "rp_id_mismatch" }, 400);
      credentialRecord = {
        id: body.id,
        publicKey: attestation.authData.publicKey,
        publicKeyPem: attestation.authData.publicKeyPem,
        algorithm: attestation.authData.algorithm,
        signCount: attestation.authData.signCount,
        userId: flow.userId,
        transports: attestation.authData.transports,
      };
    }

    storage.putCredential(credentialRecord);
    storage.putInvite({ ...invite, usedAt: Date.now() });

    const authToken = await signAuthSessionToken({ userId: flow.userId, username: flow.username });
    c.header("set-cookie", authCookieValue(authToken, webauthn.isSecure));
    return c.json({ credentialId: body.id, userId: flow.userId, username: flow.username });
  });

  app.post("/login/begin", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    const username = body?.username;
    if (!username) return c.json({ error: "missing_username" }, 400);

    const user = storage.findUserByUsername(username);
    if (!user) return c.json({ error: "user_not_found" }, 404);

    const webauthn = getRequestWebAuthnContext(c);
    const credentials = storage.listCredentials().filter((credential) => credential.userId === user.id);
    const challenge = encodeBase64Url(crypto.randomUUID());
    const flowToken = await signFlowToken({ flowType: "login", challenge, username, userId: user.id });

    return c.json({
      challenge,
      flowToken,
      rpId: webauthn.rpId,
      timeout: 60000,
      userVerification: "preferred",
      allowCredentials: credentials.map((credential) => ({ id: credential.id, type: "public-key", transports: credential.transports ?? ["internal"] })),
    });
  });

  app.post("/login/complete", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    const flowToken = body?.flowToken;
    if (!flowToken) return c.json({ error: "missing_flow_token" }, 400);

    const clientDataJSON = body?.response?.clientDataJSON;
    const authenticatorData = body?.response?.authenticatorData;
    const signature = body?.response?.signature;
    const userHandle = body?.response?.userHandle;
    if (!clientDataJSON || !authenticatorData || !signature || !userHandle) return c.json({ error: "invalid_assertion" }, 400);

    let flow;
    try {
      flow = await verifyFlowToken(flowToken, "login");
    } catch (error) {
      if (isJwtExpiredError(error)) return c.json({ error: "flow_token_expired" }, 400);
      return c.json({ error: "invalid_flow_token" }, 400);
    }

    const clientData = JSON.parse(decodeBase64Url(clientDataJSON));
    const webauthn = getRequestWebAuthnContext(c);
    if (clientData?.challenge !== flow.challenge) return c.json({ error: "authentication_session_not_found" }, 400);
    if (clientData.origin !== webauthn.origin) return c.json({ error: "origin_mismatch" }, 400);

    const credential = storage.getCredential(body.id);
    if (!credential) return c.json({ error: "credential_not_found" }, 404);
    if (credential.userId !== flow.userId) return c.json({ error: "credential_not_owned_by_user" }, 403);
    const allowedCredentialIds = storage.listCredentials().filter((candidate) => candidate.userId === flow.userId).map((candidate) => candidate.id);
    if (!allowedCredentialIds.includes(body.id)) return c.json({ error: "credential_not_allowed" }, 403);
    if (!credential.publicKeyPem) return c.json({ error: "credential_missing_public_key" }, 400);

    const authData = JSON.parse(decodeBase64Url(authenticatorData));
    if (authData.rpId !== webauthn.rpId) return c.json({ error: "rp_id_mismatch" }, 400);
    if (decodeBase64Url(userHandle) !== flow.userId) return c.json({ error: "user_handle_mismatch" }, 403);
    if (authData.signCount <= credential.signCount) return c.json({ error: "sign_count_rollback" }, 400);

    let signatureValid = false;
    try {
      signatureValid = verifyAssertionSignature({ publicKeyPem: credential.publicKeyPem, authenticatorData, clientDataJSON, signature });
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) return c.json({ error: "invalid_signature" }, 400);

    storage.putCredential({ ...credential, signCount: authData.signCount });
    storage.recordSession({ userId: flow.userId, createdAt: Date.now() });

    const authToken = await signAuthSessionToken({ userId: flow.userId, username: flow.username });
    c.header("set-cookie", authCookieValue(authToken, webauthn.isSecure));
    return c.json({ credentialId: credential.id, userId: flow.userId, username: flow.username });
  });

  return app;
}
