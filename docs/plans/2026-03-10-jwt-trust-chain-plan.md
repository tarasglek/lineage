# JWT Trust Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add JWT-backed auth sessions, JWT-backed WebAuthn flow state, trust-chain authorization, abuse-path tests, and SSR trust-chain visibility.

**Architecture:** Keep DB state as source of truth for users, invites, credentials, ancestry, and counters. Use `jose` to sign short-lived JWT flow tokens for register/login and a JWT auth session cookie for SSR authorization. Keep WebAuthn challenge/response as JSON while using SSR pages/forms for navigation and trust-chain UX.

**Tech Stack:** Deno, Hono, jose, SSR HTML/forms, JWT cookies, Go passkey helper, HTTP integration tests

---

### Task 1: Add JWT helpers and library wiring

**Files:**
- Modify: `deno.json`
- Create: `src/auth/jwt.ts`
- Test: `tests/helpers/jwt_test.ts`

**Step 1: Write the failing test**

Add tests for:
- sign and verify auth session JWT
- sign and verify flow JWT
- reject expired JWT
- reject wrong token type

**Step 2: Run test to verify it fails**

Run: `deno test tests/helpers/jwt_test.ts -A`
Expected: FAIL because helper module and dependency do not exist.

**Step 3: Write minimal implementation**

Add `jose` import and implement helpers for:
- signing auth JWT
- verifying auth JWT
- signing flow JWT
- verifying flow JWT

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add deno.json src/auth/jwt.ts tests/helpers/jwt_test.ts
git commit -m "feat(auth): add jwt helpers"
```

---

### Task 2: Add JWT auth session cookie and protected invite routes

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `tests/helpers/test_app.ts`
- Test: `tests/http/invite_authorization_test.ts`

**Step 1: Write the failing test**

Add tests for:
- unauthenticated `GET /invites/new` rejected
- unauthenticated `POST /invites` rejected
- authenticated user can create invite
- forged posted inviter id does not let user act as another user

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/invite_authorization_test.ts -A`
Expected: FAIL because invite routes are unauthenticated and trust form input.

**Step 3: Write minimal implementation**

Implement:
- JWT auth cookie issue on successful register/login
- auth middleware/helper to read current user from cookie
- protect invite SSR routes
- derive inviter from session JWT only
- reject invalid target user for device invite

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/helpers/test_app.ts tests/http/invite_authorization_test.ts
git commit -m "feat(auth): protect invite routes with jwt sessions"
```

---

### Task 3: Replace register flow session storage with JWT flow state

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `tests/http/passkey_registration_test.ts`
- Modify: `tests/http/trust_chain_story_test.ts`

**Step 1: Write the failing test**

Add tests for:
- `/register/begin` returns `flowToken`
- `/register/complete` rejects missing flow token
- `/register/complete` rejects tampered flow token
- `/register/complete` rejects expired flow token

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_registration_test.ts -A`
Expected: FAIL because register flow still uses in-memory sessions.

**Step 3: Write minimal implementation**

Implement JWT-backed register flow state.
Keep challenge in WebAuthn JSON and validate complete via flow JWT.
Remove dependence on registration session lookup for the normal path.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/http/passkey_registration_test.ts tests/http/trust_chain_story_test.ts
git commit -m "feat(auth): use jwt register flow state"
```

---

### Task 4: Replace login flow session storage with JWT flow state

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `tests/http/passkey_login_test.ts`
- Modify: `tests/http/trust_chain_story_test.ts`

**Step 1: Write the failing test**

Add tests for:
- `/login/begin` returns `flowToken`
- `/login/complete` rejects missing flow token
- `/login/complete` rejects tampered flow token
- `/login/complete` rejects expired flow token

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_login_test.ts -A`
Expected: FAIL because login flow still uses in-memory auth sessions.

**Step 3: Write minimal implementation**

Implement JWT-backed login flow state.
Use flow JWT to validate challenge, username, and allowed user context.
Keep DB lookup for credential truth and signCount.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/http/passkey_login_test.ts tests/http/trust_chain_story_test.ts
git commit -m "feat(auth): use jwt login flow state"
```

---

### Task 5: Add SSR trust-chain/account visibility

**Files:**
- Modify: `src/passkey_app.ts`
- Test: `tests/http/trust_chain_visibility_test.ts`
- Modify: `tests/http/trust_chain_story_test.ts` as needed

**Step 1: Write the failing test**

Add tests for an authenticated SSR page that shows:
- current username
- invited-by user
- invites created by current user
- device credentials on the account

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/trust_chain_visibility_test.ts -A`
Expected: FAIL because SSR trust page does not exist.

**Step 3: Write minimal implementation**

Add a protected SSR account/trust page and render the relevant trust-chain data.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/http/trust_chain_visibility_test.ts tests/http/trust_chain_story_test.ts
git commit -m "feat(ui): add trust chain account page"
```

---

### Task 6: Full verification

**Files:**
- Modify as needed: `src/**`, `tests/**`, `docs/plans/**`

**Step 1: Run focused authorization and trust tests**

Run:
- `deno test tests/http/invite_authorization_test.ts -A`
- `deno test tests/http/trust_chain_visibility_test.ts -A`
- `deno test tests/http/trust_chain_story_test.ts -A`

Expected: PASS.

**Step 2: Run full app suite**

Run: `deno test tests/http tests/helpers -A`
Expected: PASS.

**Step 3: Run helper repo tests**

Run: `cd /home/taras/Document/passkey-test-helper && go test ./...`
Expected: PASS.

**Step 4: Commit**

```bash
git add src tests docs/plans deno.json
git commit -m "feat(auth): finish jwt trust chain enforcement"
```
