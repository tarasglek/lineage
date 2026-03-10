# JWT Auth Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add token hardening, complete SSR login/logout flow, redirect-based SSR auth gating, and storage boundaries for later durable backing stores.

**Architecture:** Keep JWT for auth cookie and flow tokens. Keep WebAuthn begin/complete as JSON. Use SSR pages/forms for login/logout and protected app pages. Replace direct route coupling to raw maps with simple storage interfaces backed by the existing in-memory state.

**Tech Stack:** Deno, Hono, jose, SSR HTML/forms, JWT cookies, Go passkey helper, HTTP integration tests

---

### Task 1: Add HTTP-level token hardening tests

**Files:**
- Modify: `tests/http/passkey_login_test.ts`
- Modify: `tests/http/passkey_registration_test.ts`
- Create: `tests/http/auth_session_test.ts`

**Step 1: Write the failing tests**

Add tests for:
- protected page rejects expired auth cookie by redirecting to `/login`
- protected page rejects invalid auth cookie by redirecting to `/login`
- `/login/complete` rejects expired flow token
- `/login/complete` rejects wrong flow token type
- `/register/complete` rejects wrong flow token type

**Step 2: Run tests to verify they fail**

Run:
- `deno test tests/http/auth_session_test.ts -A`
- `deno test tests/http/passkey_login_test.ts -A`
- `deno test tests/http/passkey_registration_test.ts -A`

Expected: FAIL.

**Step 3: Write minimal implementation**

Tighten JWT verification handling and protected-page auth behavior.

**Step 4: Run tests to verify they pass**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/http/auth_session_test.ts tests/http/passkey_login_test.ts tests/http/passkey_registration_test.ts
git commit -m "test(auth): harden jwt session and flow handling"
```

---

### Task 2: Add SSR login and logout flow

**Files:**
- Modify: `src/passkey_app.ts`
- Create: `tests/http/ssr_login_flow_test.ts`

**Step 1: Write the failing tests**

Add tests for:
- `GET /login` returns login form
- `POST /login` redirects to `/login/passkey?username=...`
- `GET /login/passkey` renders passkey login page
- `POST /logout` clears auth cookie
- protected SSR pages redirect to `/login`

**Step 2: Run tests to verify they fail**

Run: `deno test tests/http/ssr_login_flow_test.ts -A`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement SSR login page, login form redirect, passkey page, logout route, and redirect-based auth guard.

**Step 4: Run tests to verify they pass**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/http/ssr_login_flow_test.ts
git commit -m "feat(ui): add ssr login and logout flow"
```

---

### Task 3: Extract storage boundaries

**Files:**
- Create: `src/passkey_storage.ts`
- Modify: `src/passkey_app.ts`
- Modify: `tests/helpers/test_app.ts`
- Modify: tests as needed

**Step 1: Write the failing test**

Add or update tests so app creation uses a storage interface instead of direct map access.

**Step 2: Run test to verify it fails**

Run focused tests around app creation and trust chain.
Expected: FAIL.

**Step 3: Write minimal implementation**

Introduce storage interfaces and an in-memory implementation backed by the existing maps.
Move route logic to the storage boundary without changing app behavior.

**Step 4: Run tests to verify it passes**

Run:
- `deno test tests/http/trust_chain_story_test.ts -A`
- `deno test tests/http tests/helpers -A`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_storage.ts src/passkey_app.ts tests/helpers/test_app.ts tests/http tests/helpers
git commit -m "refactor(auth): extract passkey storage boundary"
```

---

### Task 4: Full verification

**Files:**
- Modify as needed: `src/**`, `tests/**`, `docs/plans/**`

**Step 1: Run full app test suite**

Run:
- `deno test tests/http tests/helpers -A`

Expected: PASS.

**Step 2: Run Go helper tests**

Run:
- `cd /home/taras/Document/passkey-test-helper && go test ./...`

Expected: PASS.

**Step 3: Commit any final follow-up fixes**

```bash
git add src tests docs/plans deno.json deno.lock
git commit -m "feat(auth): finish jwt auth polish"
```
