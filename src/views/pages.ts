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

export function invitesNewPage(type: string, targetUserId: string) {
  const title = type === "device"
    ? "Create device invite"
    : "Create user invite";
  return page(
    title,
    `
    ${nav(null)}
    ${
      sectionCard(`
      <h1>${escapeHtml(title)}</h1>
      <p>${
        type === "device"
          ? "Create an invite that adds another passkey to your current account."
          : "Create an invite for a new user joining through your trust chain."
      }</p>
      <form method="post" action="/invites">
        <input type="hidden" name="type" value="${escapeHtml(type)}">
        <input type="hidden" name="targetUserId" value="${
        escapeHtml(targetUserId)
      }">
        <input name="label" placeholder="label" required>
        <button type="submit">Create invite</button>
      </form>
      <div class="inline-actions">
        <a href="/account">Back to account</a>
      </div>
    `)
    }
  `,
  );
}

export function inviteCreatedPage(
  input: {
    type: string;
    token: string;
    currentUserId: string;
    inviteUrl: string;
  },
) {
  const heading = input.type === "user"
    ? "User invitation ready"
    : "Passkey enrollment link ready";
  return page(
    "Invite created",
    `
    ${nav(null)}
    ${
      sectionCard(`
      <h1>${escapeHtml(heading)}</h1>
      <p>${
        input.type === "user"
          ? "Share this link so someone can accept the invitation and create an account."
          : "Open this link on the device where you want to add another passkey."
      }</p>
      <p><a href="${escapeHtml(input.inviteUrl)}">${
        escapeHtml(input.inviteUrl)
      }</a></p>
      <pre>${escapeHtml(input.token)}</pre>
      <div data-token="${escapeHtml(input.token)}" data-type="${
        escapeHtml(input.type)
      }" data-inviter-user-id="${
        escapeHtml(input.currentUserId)
      }" data-target-user-id="${
        escapeHtml(input.type === "device" ? input.currentUserId : "")
      }"></div>
      <div class="inline-actions">
        <a href="/account">Back to account</a>
      </div>
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
        <a href="/invites/new?type=device&targetUserId=${
        encodeURIComponent(input.userId)
      }">Add another passkey</a>
      </div>
      <ul class="list">
        ${
        input.credentials.map((id) =>
          `<li data-credential-id="${escapeHtml(id)}">${escapeHtml(id)}</li>`
        ).join("") || "<li>No passkeys found.</li>"
      }
      </ul>
    `)
    }
    ${
      sectionCard(`
      <h2>Invite user</h2>
      <div class="inline-actions">
        <a href="/invites/new?type=user">Invite user</a>
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
