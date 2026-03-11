# Device Invite QR UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make “Add another passkey” create a device invite immediately, render an SSR page with the enrollment link and inline SVG QR code, and show active device invite links alongside enrolled passkeys on `/account`.

**Architecture:** Keep user invites on the existing `/invites/new` and `/invites` flow, but split device enrollment into its own authenticated POST route and SSR result page. Reuse the existing invite storage model, filter active device invites on the account page, and generate the QR code server-side as inline SVG.

**Tech Stack:** Deno, Hono, SSR HTML templates in `src/views/pages.ts`, SQLite/in-memory invite storage, npm QR code SVG library, Deno HTTP tests.

---

### Task 1: Add failing tests for direct device invite creation and account display

**Files:**
- Modify: `tests/http/invite_authorization_test.ts`
- Modify: `tests/http/trust_chain_visibility_test.ts`

**Step 1: Write the failing auth test for unauthenticated device invite creation**

Add a test in `tests/http/invite_authorization_test.ts`:

```ts
Deno.test("POST /invites/device redirects unauthenticated access to /login", async () => {
  const { app } = await createTestApp();

  const res = await app.request("/invites/device", {
    method: "POST",
    redirect: "manual",
  });

  if (res.status !== 302) throw new Error(`expected 302, got ${res.status}`);
  if (res.headers.get("location") !== "/login") {
    throw new Error(`expected redirect to /login, got ${res.headers.get("location")}`);
  }
});
```

**Step 2: Write the failing auth test for authenticated device invite result page**

Add a test in `tests/http/invite_authorization_test.ts`:

```ts
Deno.test("authenticated user can create a device invite with svg qr", async () => {
  const { app, seedUserWithPasskey, getInvite } = await createTestApp();
  const alice = await seedUserWithPasskey("alice");

  const loginRes = await app.request("/test/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: alice.userId }),
  });
  const cookie = getCookie(loginRes);
  if (!cookie) throw new Error("missing auth cookie");

  const res = await app.request("/invites/device", {
    method: "POST",
    headers: { cookie },
  });
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);

  const html = await res.text();
  if (!html.includes("Add another passkey")) throw new Error("missing heading");
  if (!html.includes("/register?inviteToken=")) throw new Error("missing enrollment link");
  if (!html.includes("<svg")) throw new Error("missing qr svg");

  const token = html.match(/data-token="([^"]+)"/)?.[1];
  if (!token) throw new Error("missing invite token");
  const invite = getInvite(token);
  if (!invite) throw new Error("invite not stored");
  if (invite.type !== "device") throw new Error(`expected device, got ${invite.type}`);
  if (invite.inviterUserId !== alice.userId) throw new Error("wrong inviter");
  if (invite.targetUserId !== alice.userId) throw new Error("wrong target user");
});
```

**Step 3: Write the failing account visibility test for active device invite links**

Update `tests/http/trust_chain_visibility_test.ts` so the authenticated account page asserts:

```ts
if (!html.includes("Pending passkey invites")) {
  throw new Error("missing pending passkey invites section");
}
if (!html.includes(`data-device-invite-token="${bobInvite}"`)) {
  throw new Error("missing device invite token");
}
if (!html.includes(`/register?inviteToken=${bobInvite}`)) {
  throw new Error("missing device invite link");
}
if (html.includes('/invites/new?type=device')) {
  throw new Error("should not link to device invite form page");
}
```

Also add one expired or used device invite fixture and assert it does not appear.

**Step 4: Run tests to verify they fail**

Run:
```bash
deno test tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts -A
```

Expected: FAIL because `POST /invites/device` and pending device invite rendering do not exist yet.

**Step 5: Commit**

```bash
git add tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts
git commit -m "test(ui): define direct device invite qr flow"
```

### Task 2: Add QR library dependency and server-side QR helper

**Files:**
- Modify: `deno.json`
- Create: `src/qr.ts`
- Test: `tests/helpers` or a focused unit test if needed

**Step 1: Choose and add a QR SVG library import**

Add a small npm dependency in `deno.json` imports, for example a QR package that exposes SVG generation.

Example shape:

```json
"imports": {
  "qrcode-svg": "npm:qrcode-svg@^1.1.0"
}
```

Use the actual package/version chosen after checking its API.

**Step 2: Write a minimal helper wrapper**

Create `src/qr.ts` with a helper like:

```ts
export function renderQrSvg(text: string): string {
  // instantiate library
  // return raw svg markup string
}
```

The helper should centralize library usage so templates stay simple.

**Step 3: Add a focused test if the library API needs verification**

If useful, create a small test that asserts:
- returned string contains `<svg`
- returned string contains encoded content indirectly through SVG markup

**Step 4: Run the focused test**

Run the smallest relevant command, for example:
```bash
deno test tests/helpers -A
```

Expected: PASS.

**Step 5: Commit**

```bash
git add deno.json src/qr.ts tests/helpers
git commit -m "feat(ui): add server-side svg qr helper"
```

### Task 3: Add a dedicated device invite result page

**Files:**
- Modify: `src/views/pages.ts`
- Possibly modify: `src/views/layout.ts` if styling hooks are needed
- Test: `tests/http/invite_authorization_test.ts`

**Step 1: Write the new SSR page renderer**

Add a new page helper in `src/views/pages.ts` such as:

```ts
export function deviceInvitePage(input: {
  token: string;
  inviteUrl: string;
  qrSvg: string;
}) {
  return page(
    "Add another passkey",
    `...`
  );
}
```

The page should include:
- heading `Add another passkey`
- explanatory text
- clickable full invite URL
- visible token
- inline QR SVG
- `Back to account`
- machine-checkable attributes like `data-token="..."`

**Step 2: Keep the existing generic invite page for user invites only**

Do not remove `inviteCreatedPage` yet unless fully unnecessary. Keep user invite behavior unchanged.

**Step 3: Run relevant tests**

Run:
```bash
deno test tests/http/invite_authorization_test.ts -A
```

Expected: still FAIL until the route is wired.

**Step 4: Commit**

```bash
git add src/views/pages.ts
git commit -m "feat(ui): add device invite result page"
```

### Task 4: Add authenticated `POST /invites/device`

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `src/views/pages.ts` imports if needed
- Modify: `src/qr.ts` imports if needed
- Test: `tests/http/invite_authorization_test.ts`

**Step 1: Add the failing route wiring mentally from tests**

Implement an authenticated POST route before or near the existing invite routes:

```ts
app.post("/invites/device", async (c) => {
  const currentUser = await getAuthenticatedUser(c, storage);
  if (!currentUser) return authErrorResponse(c);

  const token = crypto.randomUUID();
  storage.putInvite({
    token,
    type: "device",
    inviterUserId: currentUser.id,
    targetUserId: currentUser.id,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    usedAt: null,
  });

  const origin = getRequestWebAuthnContext(c).origin;
  const inviteUrl = new URL("/register", origin);
  inviteUrl.searchParams.set("inviteToken", token);

  return c.html(deviceInvitePage({
    token,
    inviteUrl: inviteUrl.toString(),
    qrSvg: renderQrSvg(inviteUrl.toString()),
  }));
});
```

**Step 2: Leave existing user invite route behavior alone**

Do not mix user invite and device invite rendering. Keep `/invites` for user invite form submissions.

**Step 3: Run tests to verify route behavior passes**

Run:
```bash
deno test tests/http/invite_authorization_test.ts -A
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/passkey_app.ts src/views/pages.ts src/qr.ts deno.json tests/http/invite_authorization_test.ts
git commit -m "feat(auth): create device invites directly with qr page"
```

### Task 5: Update `/account` passkeys section to show credentials and active device invite links

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `src/views/pages.ts`
- Test: `tests/http/trust_chain_visibility_test.ts`

**Step 1: Filter active device invites in the account route**

In `src/passkey_app.ts`, compute separate lists:

```ts
const now = Date.now();
const deviceInvites = storage.listInvites().filter((invite) =>
  invite.type === "device" &&
  invite.inviterUserId === currentUser.id &&
  invite.targetUserId === currentUser.id &&
  invite.usedAt === null &&
  invite.expiresAt > now
);

const userInvites = storage.listInvites().filter((invite) =>
  invite.inviterUserId === currentUser.id && invite.type === "user"
);
```

Build full device invite URLs with the current origin for display.

**Step 2: Extend the account page input model**

Update `accountPage(...)` input type in `src/views/pages.ts` to accept:

```ts
deviceInvites: Array<{ token: string; inviteUrl: string }>;
userInvites: Array<{ token: string; type: string; label?: string | null }>;
```

**Step 3: Update the passkeys section markup**

Render:
- a POST form button to `/invites/device`
- `Enrolled passkeys` list of credential IDs
- `Pending passkey invites` list of device invite IDs with full links

Example markup shape:

```ts
<form method="post" action="/invites/device">
  <button type="submit">Add another passkey</button>
</form>
<ul>
  ...credentials...
</ul>
<ul>
  <li data-device-invite-token="...">
    <a href="full-url">full-url</a>
  </li>
</ul>
```

Keep the user invite section below it and unchanged in spirit.

**Step 4: Run visibility tests**

Run:
```bash
deno test tests/http/trust_chain_visibility_test.ts -A
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts src/views/pages.ts tests/http/trust_chain_visibility_test.ts
git commit -m "feat(ui): show pending device invite links on account"
```

### Task 6: Remove remaining device-form assumptions and verify the whole flow

**Files:**
- Modify: any tests still assuming label-based device invite creation
- Review: `src/views/pages.ts`
- Review: `src/passkey_app.ts`

**Step 1: Search for old device invite form assumptions**

Run:
```bash
rg -n "type=device|targetUserId|label.*device|Create device invite" src tests
```

Update tests and UI copy so device invites are no longer described as a separate form flow from `/account`.

**Step 2: Run the full relevant test set**

Run:
```bash
deno test tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts tests/http/ssr_login_flow_test.ts tests/http/passkey_registration_test.ts -A
```

Expected: PASS.

**Step 3: Manual spot-check in browser if app is running**

Verify manually:
- `/account` shows Add another passkey button
- clicking it yields a link + SVG QR page
- scanning/opening the link reaches registration flow
- account page shows pending device invite link afterward

**Step 4: Commit**

```bash
git add src tests
git commit -m "refactor(ui): remove old device invite form flow"
```

### Task 7: Final verification

**Files:**
- No code changes required unless verification reveals issues

**Step 1: Run final verification commands**

Run:
```bash
deno test -A
```

Expected: PASS.

**Step 2: Review changed files**

Run:
```bash
git status --short
git diff --stat
```

Expected: only intended files changed.

**Step 3: Commit any final fixups if needed**

```bash
git add .
git commit -m "test: verify device invite qr enrollment flow"
```

Only do this if verification required a final code adjustment.
