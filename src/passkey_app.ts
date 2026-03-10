import { Hono, type Context } from "@hono/hono";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  isJwtExpiredError,
  signAuthSessionToken,
  signFlowToken,
  verifyAuthSessionToken,
  verifyFlowToken,
} from "./auth/jwt.ts";

function verifyAssertionSignature(input: {
  publicKeyPem: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}) {
  const authDataBytes = Buffer.from(decodeBase64Url(input.authenticatorData), "binary");
  const clientDataBytes = Buffer.from(decodeBase64Url(input.clientDataJSON), "binary");
  const clientDataHash = createHash("sha256").update(clientDataBytes).digest();
  const signedBytes = Buffer.concat([authDataBytes, clientDataHash]);
  const signatureBytes = Buffer.from(decodeBase64Url(input.signature), "binary");
  const publicKey = createPublicKey(input.publicKeyPem);

  return verifySignature("sha256", signedBytes, publicKey, signatureBytes);
}

type Invite = {
  token: string;
  type: "user" | "device";
  inviterUserId: string | null;
  targetUserId?: string;
  label?: string;
  expiresAt: number;
  usedAt: number | null;
};

type User = {
  id: string;
  username: string;
  invitedBy?: string | null;
};

type Credential = {
  id: string;
  publicKey: string;
  publicKeyPem?: string;
  algorithm: number;
  signCount: number;
  userId: string;
  transports?: string[];
};

export type TestState = {
  providerRootUserId?: string;
  invites: Map<string, Invite>;
  users: Map<string, User>;
  credentials: Map<string, Credential>;
  sessions: Array<{ userId: string; createdAt: number }>;
};

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function authCookieValue(token: string) {
  return `auth=${token}; HttpOnly; Path=/; SameSite=Lax`;
}

async function getAuthenticatedUser(c: Context, state: TestState) {
  const cookies = parseCookieHeader(c.req.header("cookie") ?? null);
  const token = cookies.get("auth");
  if (!token) return null;

  try {
    const payload = await verifyAuthSessionToken(token);
    const user = state.users.get(payload.userId);
    if (!user) return null;
    return user;
  } catch {
    return null;
  }
}

function authErrorResponse(c: Context) {
  return c.redirect("/login", 302);
}

export function createPasskeyApp(state: TestState) {
  const app = new Hono();

  app.post("/test/login", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    const userId = body?.userId;
    if (!userId) return c.json({ error: "missing_user_id" }, 400);
    const user = state.users.get(userId);
    if (!user) return c.json({ error: "user_not_found" }, 404);

    const token = await signAuthSessionToken({ userId: user.id, username: user.username });
    c.header("set-cookie", authCookieValue(token));
    return c.json({ userId: user.id, username: user.username });
  });

  app.get("/register", (c) => {
    const inviteToken = c.req.query("inviteToken") ?? "";
    return c.html(`<!doctype html><html><body>
      <form method="post" action="/register">
        <input type="hidden" name="inviteToken" value="${inviteToken}">
        <input name="username">
        <button type="submit">Register</button>
      </form>
    </body></html>`);
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
    return c.html(`<!doctype html><html><body>
      <div data-invite-token="${inviteToken}" data-username="${username}">passkey-registration</div>
    </body></html>`);
  });

  app.get("/invites/new", async (c) => {
    const currentUser = await getAuthenticatedUser(c, state);
    if (!currentUser) return authErrorResponse(c);

    const type = c.req.query("type") ?? "user";
    const targetUserId = c.req.query("targetUserId") ?? currentUser.id;
    return c.html(`<!doctype html><html><body>
      <form method="post" action="/invites">
        <input type="hidden" name="type" value="${type}">
        <input type="hidden" name="targetUserId" value="${targetUserId}">
        <input name="label">
        <button type="submit">Create invite</button>
      </form>
    </body></html>`);
  });

  app.post("/invites", async (c) => {
    const currentUser = await getAuthenticatedUser(c, state);
    if (!currentUser) return authErrorResponse(c);

    const form = await c.req.formData();
    const token = crypto.randomUUID();
    const type = String(form.get("type") ?? "user") as "user" | "device";
    const targetUserId = String(form.get("targetUserId") ?? "") || undefined;
    const label = String(form.get("label") ?? "");

    if (type === "device" && targetUserId !== currentUser.id) {
      return c.html("<!doctype html><html><body>forbidden</body></html>", 403);
    }

    state.invites.set(token, {
      token,
      type,
      inviterUserId: currentUser.id,
      targetUserId: type === "device" ? currentUser.id : undefined,
      label,
      expiresAt: Date.now() + 60_000,
      usedAt: null,
    });
    return c.html(`<!doctype html><html><body>
      <div data-token="${token}" data-type="${type}" data-inviter-user-id="${currentUser.id}" data-target-user-id="${type === "device" ? currentUser.id : ""}">${token}</div>
    </body></html>`);
  });

  app.get("/account", async (c) => {
    const currentUser = await getAuthenticatedUser(c, state);
    if (!currentUser) return authErrorResponse(c);

    const invitedBy = currentUser.invitedBy ?? "";
    const invites = Array.from(state.invites.values()).filter((invite) => invite.inviterUserId === currentUser.id);
    const credentials = Array.from(state.credentials.values()).filter((credential) => credential.userId === currentUser.id);

    return c.html(`<!doctype html><html><body>
      <div data-username="${currentUser.username}" data-user-id="${currentUser.id}" data-invited-by="${invitedBy}">account</div>
      <section>
        ${invites.map((invite) => `<div data-invite-token="${invite.token}" data-invite-type="${invite.type}"></div>`).join("")}
      </section>
      <section>
        ${credentials.map((credential) => `<div data-credential-id="${credential.id}"></div>`).join("")}
      </section>
    </body></html>`);
  });

  app.post("/register/begin", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    const inviteToken = body?.inviteToken;
    const username = body?.username;

    if (!inviteToken) return c.json({ error: "missing_invite_token" }, 400);
    if (!username) return c.json({ error: "missing_username" }, 400);

    const invite = state.invites.get(inviteToken);
    if (!invite) return c.json({ error: "invite_not_found" }, 404);
    if (invite.usedAt) return c.json({ error: "invite_already_used" }, 409);
    if (invite.expiresAt <= Date.now()) return c.json({ error: "invite_expired" }, 410);

    const challenge = encodeBase64Url(crypto.randomUUID());
    const userId = invite.type === "device"
      ? invite.targetUserId
      : crypto.randomUUID();
    if (!userId) return c.json({ error: "invite_missing_target_user" }, 400);

    const effectiveUsername = invite.type === "device"
      ? state.users.get(userId)?.username ?? username
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
      rp: { id: "localhost", name: "Lineage invite-network" },
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

    const attestation = JSON.parse(decodeBase64Url(attestationObject));
    if (clientData.origin !== "http://localhost") return c.json({ error: "origin_mismatch" }, 400);
    if (attestation?.authData?.rpId !== "localhost") return c.json({ error: "rp_id_mismatch" }, 400);

    const invite = flow.inviteToken ? state.invites.get(flow.inviteToken) : undefined;
    if (!invite || invite.usedAt) return c.json({ error: "invite_already_used" }, 409);

    if (invite.type === "user") {
      state.users.set(flow.userId, {
        id: flow.userId,
        username: flow.username,
        invitedBy: invite.inviterUserId,
      });
    } else {
      const existingUser = state.users.get(flow.userId);
      if (!existingUser) return c.json({ error: "device_invite_user_not_found" }, 404);
    }

    state.credentials.set(body.id, {
      id: body.id,
      publicKey: attestation.authData.publicKey,
      publicKeyPem: attestation.authData.publicKeyPem,
      algorithm: attestation.authData.algorithm,
      signCount: attestation.authData.signCount,
      userId: flow.userId,
      transports: attestation.authData.transports,
    });
    invite.usedAt = Date.now();

    const authToken = await signAuthSessionToken({ userId: flow.userId, username: flow.username });
    c.header("set-cookie", authCookieValue(authToken));
    return c.json({ credentialId: body.id, userId: flow.userId, username: flow.username });
  });

  app.post("/login/begin", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json({ error: "invalid_json" }, 400);

    const username = body?.username;
    if (!username) return c.json({ error: "missing_username" }, 400);

    const user = Array.from(state.users.values()).find((candidate) => candidate.username === username);
    if (!user) return c.json({ error: "user_not_found" }, 404);

    const credentials = Array.from(state.credentials.values()).filter((credential) => credential.userId === user.id);
    const challenge = encodeBase64Url(crypto.randomUUID());
    const flowToken = await signFlowToken({
      flowType: "login",
      challenge,
      username,
      userId: user.id,
    });

    return c.json({
      challenge,
      flowToken,
      rpId: "localhost",
      timeout: 60000,
      userVerification: "preferred",
      allowCredentials: credentials.map((credential) => ({
        id: credential.id,
        type: "public-key",
        transports: credential.transports ?? ["internal"],
      })),
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
    if (!clientDataJSON || !authenticatorData || !signature || !userHandle) {
      return c.json({ error: "invalid_assertion" }, 400);
    }

    let flow;
    try {
      flow = await verifyFlowToken(flowToken, "login");
    } catch (error) {
      if (isJwtExpiredError(error)) return c.json({ error: "flow_token_expired" }, 400);
      return c.json({ error: "invalid_flow_token" }, 400);
    }

    const clientData = JSON.parse(decodeBase64Url(clientDataJSON));
    if (clientData?.challenge !== flow.challenge) return c.json({ error: "authentication_session_not_found" }, 400);
    if (clientData.origin !== "http://localhost") return c.json({ error: "origin_mismatch" }, 400);

    const credential = state.credentials.get(body.id);
    if (!credential) return c.json({ error: "credential_not_found" }, 404);
    if (credential.userId !== flow.userId) {
      return c.json({ error: "credential_not_owned_by_user" }, 403);
    }
    const allowedCredentialIds = Array.from(state.credentials.values())
      .filter((candidate) => candidate.userId === flow.userId)
      .map((candidate) => candidate.id);
    if (!allowedCredentialIds.includes(body.id)) {
      return c.json({ error: "credential_not_allowed" }, 403);
    }
    if (!credential.publicKeyPem) {
      return c.json({ error: "credential_missing_public_key" }, 400);
    }

    const authData = JSON.parse(decodeBase64Url(authenticatorData));
    if (authData.rpId !== "localhost") return c.json({ error: "rp_id_mismatch" }, 400);
    if (decodeBase64Url(userHandle) !== flow.userId) {
      return c.json({ error: "user_handle_mismatch" }, 403);
    }
    if (authData.signCount <= credential.signCount) {
      return c.json({ error: "sign_count_rollback" }, 400);
    }
    let signatureValid = false;
    try {
      signatureValid = verifyAssertionSignature({
        publicKeyPem: credential.publicKeyPem,
        authenticatorData,
        clientDataJSON,
        signature,
      });
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      return c.json({ error: "invalid_signature" }, 400);
    }

    credential.signCount = authData.signCount;
    state.sessions.push({ userId: flow.userId, createdAt: Date.now() });

    const authToken = await signAuthSessionToken({ userId: flow.userId, username: flow.username });
    c.header("set-cookie", authCookieValue(authToken));
    return c.json({ credentialId: credential.id, userId: flow.userId, username: flow.username });
  });

  return app;
}
