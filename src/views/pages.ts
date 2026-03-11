import { assetUrl, escapeHtml, nav, page, sectionCard } from "./layout.ts";

export function landingPage(currentUser?: { username: string } | null) {
  return page(
    "Lineage invite-network",
    `
    ${nav(currentUser)}
    ${
      sectionCard(`
      <h1>Lineage invite-network</h1>
      <p>A self-hosted, invite-only passkey identity provider for private communities.</p>
      <div class="actions">
        <a href="/login">Sign in</a>
        ${currentUser ? `<a href="/account">Go to your account</a>` : ""}
      </div>
    `)
    }
    ${
      currentUser
        ? sectionCard(`
        <h2>Signed in as ${escapeHtml(currentUser.username)}</h2>
        <form method="post" action="/logout">
          <button type="submit">Log out</button>
        </form>
      `)
        : ""
    }
  `,
  );
}

export function loginPage() {
  return page(
    "Login",
    `
    ${nav(null)}
    ${
      sectionCard(`
      <section data-passkey-flow="login">
        <h1>Sign in</h1>
        <p>Use a saved passkey or security key to sign in.</p>
        <div class="actions">
          <button id="passkey-action" type="button">Sign in with passkey</button>
        </div>
        <div id="status">Ready.</div>
      </section>
      <script src="${assetUrl("/static/passkey-shared.js")}"></script>
      <script src="${assetUrl("/static/passkey-login.js")}"></script>
    `)
    }
  `,
  );
}

export function loginPasskeyPage(username: string) {
  return page(
    "Passkey login",
    `
    ${nav(null)}
    ${
      sectionCard(`
      <section data-passkey-flow="login" data-username="${
        escapeHtml(username)
      }">
        <h1>Sign in with passkey</h1>
        <p>Username: <strong>${escapeHtml(username)}</strong></p>
        <p class="muted">Your browser will ask you to use a saved passkey or security key.</p>
        <div class="actions">
          <button id="passkey-action" type="button">Sign in with passkey</button>
          <a href="/login">Back</a>
        </div>
        <div id="status">Ready.</div>
      </section>
      <script src="${assetUrl("/static/passkey-shared.js")}"></script>
      <script src="${assetUrl("/static/passkey-login.js")}"></script>
    `)
    }
  `,
  );
}

export function registerPage(inviteToken: string, username = "") {
  return page(
    "Register",
    `
    ${nav(null)}
    ${
      sectionCard(`
      <section data-passkey-flow="register" data-invite-token="${
        escapeHtml(inviteToken)
      }" data-username="${escapeHtml(username)}">
        <h1>Accept invitation</h1>
        <p>Create your account and register a passkey in one step.</p>
        <label>
          <span class="muted">Invite token</span>
          <input name="inviteTokenDisplay" value="${
        escapeHtml(inviteToken)
      }" disabled>
        </label>
        <input id="username" name="username" value="${
        escapeHtml(username)
      }" placeholder="username" autocomplete="username" required>
        <div class="actions">
          <button id="passkey-action" type="button">Create account with passkey</button>
        </div>
        <div id="status">Ready.</div>
      </section>
      <script src="${assetUrl("/static/passkey-shared.js")}"></script>
      <script src="${assetUrl("/static/passkey-register.js")}"></script>
    `)
    }
  `,
  );
}

export function publicInvitePage(inviteToken: string, inviteUrl: string) {
  return page(
    "Invite",
    `
    ${nav(null)}
    ${
      sectionCard(`
      <section data-invite-token="${escapeHtml(inviteToken)}">
        <h1>You've been invited</h1>
        <p>Use this invite to create an account.</p>
        <p><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>
        <div class="actions">
          <a href="/register?inviteToken=${encodeURIComponent(inviteToken)}">Create account</a>
        </div>
      </section>
    `)
    }
  `,
  );
}

export function enrollPasskeyPage(input: {
  token: string;
  inviteUrl: string;
  qrSvg: string;
}) {
  return page(
    "Enroll passkey",
    `
    ${nav(null)}
    ${
      sectionCard(`
      <section data-passkey-flow="enroll" data-invite-token="${escapeHtml(input.token)}">
        <h1>Enroll passkey</h1>
        <p>Add a passkey to your existing account.</p>
        <p><a href="${escapeHtml(input.inviteUrl)}">${escapeHtml(input.inviteUrl)}</a></p>
        <pre>${escapeHtml(input.token)}</pre>
        <div class="qr-code">${input.qrSvg}</div>
        <div class="actions">
          <button id="passkey-action" type="button">Enroll passkey</button>
          <a href="/account">Back to account</a>
        </div>
        <div id="status">Ready.</div>
      </section>
      <script src="${assetUrl("/static/passkey-shared.js")}"></script>
      <script src="${assetUrl("/static/passkey-enroll.js")}"></script>
    `)
    }
  `,
  );
}

export function accountPage(
  input: {
    username: string;
    userId: string;
    invitedBy: string;
    credentials: string[];
    deviceInvites: Array<{ token: string; inviteUrl: string }>;
    invites: Array<{ token: string; type: string; label?: string | null }>;
  },
) {
  return page(
    "Account",
    `
    ${nav({ username: input.username })}
    ${
      sectionCard(`
      <h1>Signed in as ${escapeHtml(input.username)}</h1>
      <p class="muted">Manage your account, passkeys, and invitations.</p>
      <div data-username="${escapeHtml(input.username)}" data-user-id="${
        escapeHtml(input.userId)
      }" data-invited-by="${escapeHtml(input.invitedBy)}"></div>
      <ul class="meta">
        <li><strong>Username:</strong> ${escapeHtml(input.username)}</li>
        <li><strong>User ID:</strong> ${escapeHtml(input.userId)}</li>
        <li><strong>Invited by:</strong> ${
        escapeHtml(input.invitedBy || "provider-root")
      }</li>
      </ul>
      <form method="post" action="/logout">
        <button type="submit">Log out</button>
      </form>
    `)
    }
    ${
      sectionCard(`
      <h2>Passkeys</h2>
      <div class="inline-actions">
        <form method="post" action="/enroll/passkey">
          <button type="submit">Enroll another passkey</button>
        </form>
      </div>
      <h3>Enrolled passkeys</h3>
      <ul class="list">
        ${
        input.credentials.map((id) =>
          `<li data-credential-id="${escapeHtml(id)}">${escapeHtml(id)}</li>`
        ).join("") || "<li>No passkeys found.</li>"
      }
      </ul>
      <h3>Pending enrollments</h3>
      <ul class="list">
        ${
        input.deviceInvites.map((invite) =>
          `<li data-device-invite-token="${escapeHtml(invite.token)}" data-invite-token="${escapeHtml(invite.token)}"><a href="${escapeHtml(invite.inviteUrl)}">${escapeHtml(invite.inviteUrl)}</a></li>`
        ).join("") || "<li>No pending passkey invites.</li>"
      }
      </ul>
    `)
    }
    ${
      sectionCard(`
      <h2>Invite users</h2>
      <div class="inline-actions">
        <form method="post" action="/invites/user">
          <button type="submit">Invite user</button>
        </form>
      </div>
      <ul class="list">
        ${
        input.invites.map((invite) =>
          `<li data-invite-token="${
            escapeHtml(invite.token)
          }" data-invite-type="${escapeHtml(invite.type)}">${
            escapeHtml(invite.type)
          } — ${escapeHtml(invite.label || invite.token)}</li>`
        ).join("") || "<li>No invites yet.</li>"
      }
      </ul>
    `)
    }
  `,
  );
}
