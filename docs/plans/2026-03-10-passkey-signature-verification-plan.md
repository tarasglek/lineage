# Passkey Signature Verification and Helper Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the fake TS helper, verify real login signatures in the app, and clean up disposable Go-helper build artifacts.

**Architecture:** Tests use the Go helper to generate valid passkey payloads, then mutate them directly for negative cases. The app verifies login assertions with the stored public key by checking the ECDSA signature over authenticator data and the SHA-256 hash of clientDataJSON.

**Tech Stack:** Deno, Hono, Go helper CLI, Web Crypto / crypto verification, ECDSA P-256, gitignore

---

### Task 1: Ignore disposable helper binaries

**Files:**
- Modify: `.gitignore`

**Step 1: Write the failing check**

Run: `git status --short`
Expected: `tools/.bin/` appears as untracked noise.

**Step 2: Write minimal implementation**

Add `tools/.bin/` to `.gitignore`.

**Step 3: Run verification**

Run: `git status --short`
Expected: `tools/.bin/` no longer appears.

**Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore built passkey helper binary"
```

---

### Task 2: Add failing tampered-signature login test

**Files:**
- Modify: `tests/http/passkey_login_test.ts`

**Step 1: Write the failing test**

Add a login test that:
- gets a valid Go-generated assertion
- tampers with `response.signature`
- expects `/login/complete` to reject it

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_login_test.ts -A --filter "tampered signature"`
Expected: FAIL because app does not verify signatures yet.

**Step 3: Commit red test checkpoint**

```bash
git add tests/http/passkey_login_test.ts
git commit -m "test: add tampered assertion signature case"
```

---

### Task 3: Implement real login signature verification

**Files:**
- Modify: `src/passkey_app.ts`

**Step 1: Write minimal implementation**

Implement in `/login/complete`:
- decode stored PEM public key
- decode signature DER
- hash `clientDataJSON`
- verify signature over `authenticatorData || clientDataHash`
- reject invalid signatures

**Step 2: Run verification**

Run: `deno test tests/http/passkey_login_test.ts -A`
Expected: PASS, including tampered-signature rejection.

**Step 3: Commit**

```bash
git add src/passkey_app.ts
git commit -m "feat(auth): verify login assertion signatures"
```

---

### Task 4: Replace remaining fake-helper HTTP usage

**Files:**
- Modify: `tests/http/passkey_registration_test.ts`
- Modify: `tests/http/passkey_login_test.ts`
- Modify: `tests/helpers/test_app.ts`

**Step 1: Write the failing cleanup change**

Remove fake-helper imports from HTTP tests and use:
- Go-generated payloads
- direct payload tampering for negative cases

**Step 2: Run tests to verify gaps**

Run: `deno test tests/http/passkey_registration_test.ts tests/http/passkey_login_test.ts -A`
Expected: FAIL until all negative cases are updated.

**Step 3: Write minimal implementation**

Replace fake-helper-generated negative payloads with:
- valid Go-generated payloads
- direct mutation of challenge/origin/rpId/signature/authenticatorData as needed

**Step 4: Run verification**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http tests/helpers/test_app.ts
git commit -m "test: remove fake helper from http tests"
```

---

### Task 5: Delete the fake helper

**Files:**
- Delete: `tests/helpers/fake_passkey_helper.ts`
- Delete: `tests/helpers/passkey_helper_test.ts`
- Modify: any stale imports

**Step 1: Delete the files and stale imports**

**Step 2: Run verification**

Run: `deno test tests/http tests/helpers -A`
Expected: PASS with no imports of the fake helper left.

**Step 3: Commit**

```bash
git add -A tests/helpers tests/http
git commit -m "refactor: delete fake passkey helper"
```

---

### Task 6: Full verification

**Files:**
- Modify as needed: `src/**`, `tests/**`, `.gitignore`

**Step 1: Verify app tests**

Run: `deno test tests/http tests/helpers -A`
Expected: PASS.

**Step 2: Verify helper repo still passes**

Run: `cd /home/taras/Document/passkey-test-helper && go test ./...`
Expected: PASS.

**Step 3: Commit final cleanup**

```bash
git add src tests .gitignore
git commit -m "test: tighten passkey verification and cleanup helper usage"
```
