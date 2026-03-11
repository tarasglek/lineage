# Invite vs Enroll Terminology and Flow Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split new-user invitation and same-user passkey enrollment into separate routes, pages, endpoints, and terminology so the UI and backend can no longer blur account creation with passkey enrollment.

**Architecture:** Keep the existing invite storage model with `type: "user" | "device"`, but map those types into two distinct product surfaces: `invite` for user creation and `enroll` for passkey addition. Introduce canonical public URLs for each flow, immediate creation POSTs for both actions, and separate begin/complete endpoints so the code path itself enforces the distinction.

**Tech Stack:** Deno, Hono, SSR templates in `src/views/pages.ts`, passkey WebAuthn JSON endpoints, existing in-memory/SQLite storage, server-side SVG QR rendering.

---

### Task 1: Add failing tests for the new route split and terminology

**Files:**
- Modify: `tests/http/invite_authorization_test.ts`
- Modify: `tests/http/trust_chain_visibility_test.ts`
- Modify: `tests/http/passkey_registration_test.ts`
- Modify: `tests/http/trust_chain_story_test.ts`
- Create or modify: `tests/http/enrollment_flow_test.ts`

**Step 1: Write failing tests for immediate user invite creation**

Add tests that assert:
- authenticated `POST /invites/user` creates a user invite immediately
- response redirects to or renders canonical `/invites/<token>` URL
- no label is required
- unauthenticated access redirects to `/login`

Example shape:

```ts
Deno.test("POST /invites/user redirects unauthenticated access to /login", async () => {
  const { app } = await createTestApp();
  const res = await app.request("/invites/user", { method: "POST", redirect: "manual" });
  if (res.status !== 302) throw new Error(`expected 302, got ${res.status}`);
});
```

**Step 2: Write failing tests for enrollment routes**

Add tests that assert:
- authenticated `POST /enroll/passkey` creates a device token immediately
- response points to `/enroll/passkey/<token>`
- `GET /enroll/passkey/<token>` renders enrollment terminology only
- user-registration wording is absent
- SVG QR appears

**Step 3: Write failing tests for public invite pages**

Add tests for `GET /invites/<token>`:
- valid user token shows invite page
- device token does not render user invite page
- invite page includes account-creation CTA but no enrollment wording

**Step 4: Write failing tests for separate begin/complete endpoints**

Update `tests/http/passkey_registration_test.ts` or create `tests/http/enrollment_flow_test.ts` to assert:
- `/register/begin` rejects device tokens
- `/enroll/passkey/begin` rejects user tokens
- enrollment begin/complete works for a device token without requiring user-entered username

**Step 5: Run tests to verify failure**

Run:
```bash
deno test tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts tests/http/passkey_registration_test.ts tests/http/trust_chain_story_test.ts tests/http/enrollment_flow_test.ts -A
```

Expected: FAIL because the route split and terminology separation do not exist yet.

**Step 6: Commit**

```bash
git add tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts tests/http/passkey_registration_test.ts tests/http/trust_chain_story_test.ts tests/http/enrollment_flow_test.ts
git commit -m "test(ui): define invite and enroll split"
```

### Task 2: Add SSR pages for user invite and passkey enrollment resources

**Files:**
- Modify: `src/views/pages.ts`
- Test: `tests/http/invite_authorization_test.ts`
- Test: `tests/http/enrollment_flow_test.ts`

**Step 1: Add a public user invite page renderer**

Create a page helper like:

```ts
export function publicInvitePage(input: {
  token: string;
  inviteUrl: string;
}) {
  return page("Invite", `...`);
}
```

It should include:
- heading like `You've been invited`
- visible invite URL
- CTA to continue to account creation
- data attributes for token
- no enrollment wording

**Step 2: Add a dedicated enrollment page renderer**

Create or adapt a page helper like:

```ts
export function enrollPasskeyPage(input: {
  token: string;
  inviteUrl: string;
  qrSvg: string;
}) {
  return page("Enroll passkey", `...`);
}
```

It should include:
- `Enroll passkey` heading
- account-addition wording only
- visible link and SVG QR
- no username field
- no account-creation wording

**Step 3: Run focused view-related tests**

Run:
```bash
deno test tests/http/invite_authorization_test.ts tests/http/enrollment_flow_test.ts -A
```

Expected: still FAIL until routes are wired.

**Step 4: Commit**

```bash
git add src/views/pages.ts
git commit -m "feat(ui): add separate invite and enrollment pages"
```

### Task 3: Add immediate creation routes and canonical resource URLs

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `src/views/pages.ts` imports if needed
- Test: `tests/http/invite_authorization_test.ts`
- Test: `tests/http/trust_chain_visibility_test.ts`

**Step 1: Add `POST /invites/user`**

Implement authenticated immediate user invite creation:

```ts
app.post("/invites/user", async (c) => {
  const currentUser = await getAuthenticatedUser(c, storage);
  if (!currentUser) return authErrorResponse(c);

  const token = crypto.randomUUID();
  storage.putInvite({
    token,
    type: "user",
    inviterUserId: currentUser.id,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    usedAt: null,
  });

  return c.redirect(`/invites/${encodeURIComponent(token)}`, 303);
});
```

**Step 2: Add `POST /enroll/passkey`**

Implement authenticated immediate passkey-enrollment creation:

```ts
app.post("/enroll/passkey", async (c) => {
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

  return c.redirect(`/enroll/passkey/${encodeURIComponent(token)}`, 303);
});
```

**Step 3: Add canonical GET resource routes**

Implement:
- `GET /invites/:token` for user invites only
- `GET /enroll/passkey/:token` for device tokens only

Each route should validate token type before rendering.

**Step 4: Keep old routes only long enough to preserve tests or compatibility**

Do not remove old routes until new tests are passing and old references are migrated.

**Step 5: Run route tests**

Run:
```bash
deno test tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts tests/http/enrollment_flow_test.ts -A
```

Expected: PASS or near-PASS.

**Step 6: Commit**

```bash
git add src/passkey_app.ts src/views/pages.ts tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts tests/http/enrollment_flow_test.ts
git commit -m "feat(auth): add canonical invite and enroll routes"
```

### Task 4: Split registration and enrollment WebAuthn endpoints

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `static/passkey-register.js` or replace with separate scripts
- Create: `static/passkey-enroll.js` if needed
- Test: `tests/http/passkey_registration_test.ts`
- Test: `tests/http/enrollment_flow_test.ts`

**Step 1: Keep `/register/*` for user creation only**

Update `/register/begin` and `/register/complete` so they reject device tokens with a clear error such as `wrong_invite_type`.

**Step 2: Add `/enroll/passkey/begin` and `/enroll/passkey/complete`**

Add device-only versions that:
- accept only device tokens
- do not require user-entered username
- resolve the target user from the stored token
- add credentials to the existing user only

**Step 3: Split browser JS entrypoints**

Create a dedicated enrollment script, e.g. `static/passkey-enroll.js`, that:
- reads token from page data
- calls `/enroll/passkey/begin`
- does not collect a username
- calls `/enroll/passkey/complete`
- redirects to `/account`

Leave `static/passkey-register.js` for user account creation only.

**Step 4: Run flow tests**

Run:
```bash
deno test tests/http/passkey_registration_test.ts tests/http/enrollment_flow_test.ts -A
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts static/passkey-register.js static/passkey-enroll.js tests/http/passkey_registration_test.ts tests/http/enrollment_flow_test.ts
git commit -m "feat(auth): split register and enroll passkey endpoints"
```

### Task 5: Update account page terminology and actions

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `src/views/pages.ts`
- Test: `tests/http/trust_chain_visibility_test.ts`
- Test: `tests/http/trust_chain_story_test.ts`

**Step 1: Rename account page actions and lists**

Update the account page so it shows:
- button: `Enroll another passkey`
- subsection: `Pending enrollments`
- button: `Invite user`
- subsection: `Active invites`

**Step 2: Show canonical links**

For device tokens show full links to:
- `/enroll/passkey/<token>`

For user invites show full links to:
- `/invites/<token>`

**Step 3: Update tests accordingly**

Make tests assert the new wording and canonical links instead of legacy query-string invite links.

**Step 4: Run account/trust-chain tests**

Run:
```bash
deno test tests/http/trust_chain_visibility_test.ts tests/http/trust_chain_story_test.ts -A
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts src/views/pages.ts tests/http/trust_chain_visibility_test.ts tests/http/trust_chain_story_test.ts
git commit -m "feat(ui): rename account flows to invite and enroll"
```

### Task 6: Remove legacy mixed-flow UI entrypoints

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `src/views/pages.ts`
- Search: `src/`, `static/`, `tests/`

**Step 1: Search for legacy wording and routes**

Run:
```bash
rg -n "Create device invite|device invite|Passkey enrollment link ready|/invites/new\?type=device|/register\?inviteToken=|type=device|type=user" src static tests
```

Update or remove remaining product-facing occurrences that violate the terminology rules.

**Step 2: Decide compatibility handling**

Either:
- remove obsolete device-form routes, or
- leave them as compatibility redirects to the new routes with explicit deprecation behavior

Do the smallest thing that keeps behavior safe.

**Step 3: Run relevant targeted tests**

Run:
```bash
deno test tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts tests/http/passkey_registration_test.ts tests/http/enrollment_flow_test.ts -A
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src static tests
git commit -m "refactor(ui): remove legacy mixed invite and enroll wording"
```

### Task 7: Final verification

**Files:**
- No code changes required unless verification finds issues

**Step 1: Run full test suite**

Run:
```bash
deno test -A
```

Expected: PASS.

**Step 2: Review final diff**

Run:
```bash
git status --short
git diff --stat
```

Expected: only intended files changed.

**Step 3: Manual smoke-check if app is running**

Verify in browser:
- account page says `Enroll another passkey` and `Invite user`
- clicking `Invite user` immediately yields `/invites/<token>`
- clicking `Enroll another passkey` immediately yields `/enroll/passkey/<token>`
- user invite page never says “enroll”
- enrollment page never says “create account”

**Step 4: Commit any last fixups if needed**

```bash
git add .
git commit -m "test: verify invite and enroll split"
```

Only if verification required a final code adjustment.
