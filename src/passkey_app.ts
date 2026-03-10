import { type Context, Hono } from "@hono/hono";
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

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return atob(padded);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/static/style.css">
    <style>
      main { max-width: 720px; margin: 0 auto; }
      .card { background: var(--surface); padding: 20px; border-radius: var(--radius); margin: 0 0 16px 0; }
      .muted { color: var(--text-light); }
      .actions { display: grid; gap: 12px; margin-top: 16px; }
      .inline-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
      .inline-actions a, .inline-actions button { width: auto; }
      ul.meta, ul.list { margin: 12px 0 0 0; padding-left: 20px; }
      code, pre { background: #f0f0f0; border-radius: 8px; padding: 2px 6px; }
      pre { padding: 12px; overflow: auto; }
    </style>
  </head>
  <body>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}

function webauthnClientScript(mode: "register" | "login") {
  const beginPath = mode === "register" ? "/register/begin" : "/login/begin";
  const completePath = mode === "register" ? "/register/complete" : "/login/complete";
  const credentialMethod = mode === "register" ? "create" : "get";
  return `<script>
const root = document.querySelector('[data-passkey-flow]');
const statusEl = document.getElementById('status');
const actionButton = document.getElementById('passkey-action');

function setStatus(message, kind = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = kind ? kind : '';
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function encodeBase64Url(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function publicKeyCredentialToJSON(credential) {
  const response = credential.response;
  const json = {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    response: {},
  };

  if (response.clientDataJSON) json.response.clientDataJSON = encodeBase64Url(response.clientDataJSON);
  if (response.attestationObject) json.response.attestationObject = encodeBase64Url(response.attestationObject);
  if (response.authenticatorData) json.response.authenticatorData = encodeBase64Url(response.authenticatorData);
  if (response.signature) json.response.signature = encodeBase64Url(response.signature);
  if (response.userHandle) json.response.userHandle = encodeBase64Url(response.userHandle);
  return json;
}

function normalizeCreationOptions(options) {
  return {
    publicKey: {
      ...options,
      challenge: decodeBase64Url(options.challenge),
      user: {
        ...options.user,
        id: new TextEncoder().encode(options.user.id),
      },
      excludeCredentials: (options.excludeCredentials || []).map((credential) => ({
        ...credential,
        id: decodeBase64Url(credential.id),
      })),
    },
  };
}

function normalizeRequestOptions(options) {
  return {
    publicKey: {
      ...options,
      challenge: decodeBase64Url(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((credential) => ({
        ...credential,
        id: decodeBase64Url(credential.id),
      })),
    },
  };
}

async function startFlow() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    setStatus('This browser does not support passkeys.', 'error');
    return;
  }

  const username = root?.dataset.username || '';
  const inviteToken = root?.dataset.inviteToken || '';

  actionButton.disabled = true;
  setStatus('${mode === "register" ? "Preparing passkey registration..." : "Preparing passkey sign-in..."}');

  try {
    const beginBody = ${mode === "register" ? `{ inviteToken, username }` : `{ username }`};
    const beginRes = await fetch('${beginPath}', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(beginBody),
    });
    const beginData = await beginRes.json();
    if (!beginRes.ok) {
      throw new Error(beginData.error || 'begin_failed');
    }

    setStatus('${mode === "register" ? "Touch your authenticator to create a passkey..." : "Use your passkey to sign in..."}');
    const credential = await navigator.credentials.${credentialMethod}(
      ${mode === "register" ? "normalizeCreationOptions(beginData)" : "normalizeRequestOptions(beginData)"}
    );
    if (!credential) throw new Error('credential_creation_cancelled');

    const completePayload = {
      ...publicKeyCredentialToJSON(credential),
      flowToken: beginData.flowToken,
    };

    setStatus('${mode === "register" ? "Finishing registration..." : "Finishing sign-in..."}');
    const completeRes = await fetch('${completePath}', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(completePayload),
    });
    const completeData = await completeRes.json();
    if (!completeRes.ok) {
      throw new Error(completeData.error || 'complete_failed');
    }

    setStatus('${mode === "register" ? "Registration complete. Redirecting..." : "Login complete. Redirecting..."}', 'success');
    window.location.assign('/account');
  } catch (error) {
    const message = error && error.name === 'NotAllowedError'
      ? 'Passkey prompt was cancelled or timed out.'
      : String(error?.message || error);
    setStatus(message, 'error');
    actionButton.disabled = false;
  }
}

actionButton?.addEventListener('click', () => {
  void startFlow();
});
</script>`;
}

export function createPasskeyApp(storage: PasskeyStorage) {
  const app = new Hono();

  app.get("/static/style.css", (c) => {
    return c.text(Deno.readTextFileSync(new URL("../static/style.css", import.meta.url)), 200, {
      "content-type": "text/css; charset=utf-8",
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
    return c.html(page("Lineage invite-network", `
      <section class="card">
        <h1>Lineage invite-network</h1>
        <p>A self-hosted, invite-only passkey identity provider for private communities.</p>
        <p class="muted">Access enters through explicit invites, and invitation ancestry remains visible as a trust signal.</p>
        <div class="actions">
          <a href="/login">Log in</a>
          ${currentUser ? `<a href="/account">Go to your account</a>` : ""}
        </div>
      </section>
      ${currentUser ? `
        <section class="card">
          <h2>Signed in as ${escapeHtml(currentUser.username)}</h2>
          <form method="post" action="/logout">
            <button type="submit">Log out</button>
          </form>
        </section>
      ` : `
        <section class="card">
          <h2>First-time setup</h2>
          <p>Start with a registration invite link, then create a passkey in your browser.</p>
          <p class="muted">If you do not have an invite yet, generate the bootstrap invite from the server with <code>deno task bootstrap-invite</code>.</p>
        </section>
      `}
    `));
  });

  app.get("/login", (c) => {
    return c.html(page("Login", `
      <section class="card">
        <h1>Log in</h1>
        <p>Enter your username, then continue with your passkey.</p>
        <form method="post" action="/login">
          <input name="username" placeholder="username" autocomplete="username webauthn" required>
          <button type="submit">Continue</button>
        </form>
      </section>
    `));
  });

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
    return c.html(page("Passkey login", `
      <section class="card" data-passkey-flow="login" data-username="${escapeHtml(username)}">
        <h1>Sign in with passkey</h1>
        <p>Username: <strong>${escapeHtml(username)}</strong></p>
        <p class="muted">Your browser will ask you to use a saved passkey or security key.</p>
        <div class="actions">
          <button id="passkey-action" type="button">Sign in with passkey</button>
          <a href="/login">Back</a>
        </div>
        <div id="status">Ready.</div>
      </section>
      ${webauthnClientScript("login")}
    `));
  });

  app.post("/logout", (c) => {
    c.header("set-cookie", clearedAuthCookieValue(getRequestWebAuthnContext(c).isSecure));
    return c.redirect("/login", 303);
  });

  app.get("/register", (c) => {
    const inviteToken = c.req.query("inviteToken") ?? "";
    return c.html(page("Register", `
      <section class="card">
        <h1>Create account</h1>
        <p>Choose your username, then create a passkey on the next page.</p>
        <form method="post" action="/register">
          <input type="hidden" name="inviteToken" value="${escapeHtml(inviteToken)}">
          <label>
            <span class="muted">Invite token</span>
            <input name="inviteTokenDisplay" value="${escapeHtml(inviteToken)}" disabled>
          </label>
          <input name="username" placeholder="username" autocomplete="username" required>
          <button type="submit">Continue to passkey setup</button>
        </form>
      </section>
    `));
  });

  app.post("/register", async (c) => {
    const form = await c.req.formData();
    const inviteToken = String(form.get("inviteToken") ?? "");
    const username = String(form.get("username") ?? "");
    return c.redirect(
      `/register/passkey?inviteToken=${encodeURIComponent(inviteToken)}&username=${encodeURIComponent(username)}`,
      303,
    );
  });

  app.get("/register/passkey", (c) => {
    const inviteToken = c.req.query("inviteToken") ?? "";
    const username = c.req.query("username") ?? "";
    return c.html(page("Passkey registration", `
      <section class="card" data-passkey-flow="register" data-invite-token="${escapeHtml(inviteToken)}" data-username="${escapeHtml(username)}">
        <h1>Create your passkey</h1>
        <p>Username: <strong>${escapeHtml(username)}</strong></p>
        <p class="muted">This uses your browser or device authenticator to create a phishing-resistant login credential.</p>
        <div class="actions">
          <button id="passkey-action" type="button">Create passkey</button>
          <a href="/register?inviteToken=${encodeURIComponent(inviteToken)}">Back</a>
        </div>
        <div id="status">Ready.</div>
      </section>
      ${webauthnClientScript("register")}
    `));
  });

  app.get("/invites/new", async (c) => {
    const currentUser = await getAuthenticatedUser(c, storage);
    if (!currentUser) return authErrorResponse(c);

    const type = c.req.query("type") ?? "user";
    const targetUserId = c.req.query("targetUserId") ?? currentUser.id;
    const title = type === "device" ? "Create device invite" : "Create user invite";
    return c.html(page(title, `
      <section class="card">
        <h1>${escapeHtml(title)}</h1>
        <p>${type === "device" ? "Create an invite that adds another passkey to your current account." : "Create an invite for a new user joining through your trust chain."}</p>
        <form method="post" action="/invites">
          <input type="hidden" name="type" value="${escapeHtml(type)}">
          <input type="hidden" name="targetUserId" value="${escapeHtml(targetUserId)}">
          <input name="label" placeholder="label" required>
          <button type="submit">Create invite</button>
        </form>
        <div class="inline-actions">
          <a href="/account">Back to account</a>
        </div>
      </section>
    `));
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

    return c.html(page("Invite created", `
      <section class="card">
        <h1>Invite created</h1>
        <p>Your ${escapeHtml(type)} invite is ready.</p>
        <p><a href="${escapeHtml(inviteUrl.toString())}">${escapeHtml(inviteUrl.toString())}</a></p>
        <pre>${escapeHtml(token)}</pre>
        <div data-token="${escapeHtml(token)}" data-type="${escapeHtml(type)}" data-inviter-user-id="${escapeHtml(currentUser.id)}" data-target-user-id="${escapeHtml(type === "device" ? currentUser.id : "")}"></div>
        <div class="inline-actions">
          <a href="/account">Back to account</a>
        </div>
      </section>
    `));
  });

  app.get("/account", async (c) => {
    const currentUser = await getAuthenticatedUser(c, storage);
    if (!currentUser) return authErrorResponse(c);

    const invitedBy = currentUser.invitedBy ?? "";
    const invites = storage.listInvites().filter((invite) =>
      invite.inviterUserId === currentUser.id
    );
    const credentials = storage.listCredentials().filter((credential) =>
      credential.userId === currentUser.id
    );

    return c.html(page("Account", `
      <section class="card">
        <h1>Account</h1>
        <div data-username="${escapeHtml(currentUser.username)}" data-user-id="${escapeHtml(currentUser.id)}" data-invited-by="${escapeHtml(invitedBy)}"></div>
        <ul class="meta">
          <li><strong>Username:</strong> ${escapeHtml(currentUser.username)}</li>
          <li><strong>User ID:</strong> ${escapeHtml(currentUser.id)}</li>
          <li><strong>Invited by:</strong> ${escapeHtml(invitedBy || "provider-root")}</li>
        </ul>
        <div class="inline-actions">
          <a href="/invites/new?type=user">Create user invite</a>
          <a href="/invites/new?type=device&targetUserId=${encodeURIComponent(currentUser.id)}">Create device invite</a>
        </div>
        <form method="post" action="/logout">
          <button type="submit">Log out</button>
        </form>
      </section>
      <section class="card">
        <h2>Passkeys</h2>
        <ul class="list">
          ${credentials.map((credential) => `<li data-credential-id="${escapeHtml(credential.id)}">${escapeHtml(credential.id)}</li>`).join("") || "<li>No passkeys found.</li>"}
        </ul>
      </section>
      <section class="card">
        <h2>Invites you created</h2>
        <ul class="list">
          ${invites.map((invite) => `<li data-invite-token="${escapeHtml(invite.token)}" data-invite-type="${escapeHtml(invite.type)}">${escapeHtml(invite.type)} — ${escapeHtml(invite.label || invite.token)}</li>`).join("") || "<li>No invites yet.</li>"}
        </ul>
      </section>
    `));
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
    if (invite.expiresAt <= Date.now()) {
      return c.json({ error: "invite_expired" }, 410);
    }

    const webauthn = getRequestWebAuthnContext(c);
    const challenge = encodeBase64Url(crypto.randomUUID());
    const userId = invite.type === "device"
      ? invite.targetUserId
      : crypto.randomUUID();
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
      user: {
        id: userId,
        name: effectiveUsername,
        displayName: effectiveUsername,
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
    const attestation = JSON.parse(decodeBase64Url(attestationObject));
    if (clientData.origin !== webauthn.origin) {
      return c.json({ error: "origin_mismatch" }, 400);
    }
    if (attestation?.authData?.rpId !== webauthn.rpId) {
      return c.json({ error: "rp_id_mismatch" }, 400);
    }

    const invite = flow.inviteToken
      ? storage.getInvite(flow.inviteToken)
      : undefined;
    if (!invite || invite.usedAt) {
      return c.json({ error: "invite_already_used" }, 409);
    }

    if (invite.type === "user") {
      storage.putUser({
        id: flow.userId,
        username: flow.username,
        invitedBy: invite.inviterUserId,
      });
    } else {
      const existingUser = storage.getUser(flow.userId);
      if (!existingUser) {
        return c.json({ error: "device_invite_user_not_found" }, 404);
      }
    }

    storage.putCredential({
      id: body.id,
      publicKey: attestation.authData.publicKey,
      publicKeyPem: attestation.authData.publicKeyPem,
      algorithm: attestation.authData.algorithm,
      signCount: attestation.authData.signCount,
      userId: flow.userId,
      transports: attestation.authData.transports,
    });
    storage.putInvite({ ...invite, usedAt: Date.now() });

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

    const username = body?.username;
    if (!username) return c.json({ error: "missing_username" }, 400);

    const user = storage.findUserByUsername(username);
    if (!user) return c.json({ error: "user_not_found" }, 404);

    const webauthn = getRequestWebAuthnContext(c);
    const credentials = storage.listCredentials().filter((credential) =>
      credential.userId === user.id
    );
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
      rpId: webauthn.rpId,
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
      if (isJwtExpiredError(error)) {
        return c.json({ error: "flow_token_expired" }, 400);
      }
      return c.json({ error: "invalid_flow_token" }, 400);
    }

    const clientData = JSON.parse(decodeBase64Url(clientDataJSON));
    const webauthn = getRequestWebAuthnContext(c);
    if (clientData?.challenge !== flow.challenge) {
      return c.json({ error: "authentication_session_not_found" }, 400);
    }
    if (clientData.origin !== webauthn.origin) {
      return c.json({ error: "origin_mismatch" }, 400);
    }

    const credential = storage.getCredential(body.id);
    if (!credential) return c.json({ error: "credential_not_found" }, 404);
    if (credential.userId !== flow.userId) {
      return c.json({ error: "credential_not_owned_by_user" }, 403);
    }
    const allowedCredentialIds = storage.listCredentials()
      .filter((candidate) => candidate.userId === flow.userId)
      .map((candidate) => candidate.id);
    if (!allowedCredentialIds.includes(body.id)) {
      return c.json({ error: "credential_not_allowed" }, 403);
    }
    if (!credential.publicKeyPem) {
      return c.json({ error: "credential_missing_public_key" }, 400);
    }

    const authData = JSON.parse(decodeBase64Url(authenticatorData));
    if (authData.rpId !== webauthn.rpId) {
      return c.json({ error: "rp_id_mismatch" }, 400);
    }
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

    storage.putCredential({ ...credential, signCount: authData.signCount });
    storage.recordSession({ userId: flow.userId, createdAt: Date.now() });

    const authToken = await signAuthSessionToken({
      userId: flow.userId,
      username: flow.username,
    });
    c.header("set-cookie", authCookieValue(authToken, webauthn.isSecure));
    return c.json({
      credentialId: credential.id,
      userId: flow.userId,
      username: flow.username,
    });
  });

  return app;
}
