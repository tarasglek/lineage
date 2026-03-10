# Go Passkey Helper Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fake TS passkey payload generator with a real cryptographic Go helper stored as a separate repo and mounted here as a submodule.

**Architecture:** A standalone Go repo under `~/Document/passkey-test-helper/` implements authenticator-style WebAuthn response generation and exposes a tiny CLI. This repo vendors it as a submodule at `tools/passkey-test-helper/`, builds it on demand through a local wrapper, and uses it from Deno HTTP integration tests.

**Tech Stack:** Go, git submodules, Deno, Hono, Deno test runner, JSON stdin/stdout CLI, WebAuthn test payload generation

---

### Task 1: Scaffold the standalone Go helper repo

**Files:**
- Create: `/home/taras/Document/passkey-test-helper/go.mod`
- Create: `/home/taras/Document/passkey-test-helper/cmd/passkey-test-helper/main.go`
- Create: `/home/taras/Document/passkey-test-helper/internal/helper/types.go`
- Create: `/home/taras/Document/passkey-test-helper/internal/helper/register.go`
- Create: `/home/taras/Document/passkey-test-helper/internal/helper/login.go`
- Create: `/home/taras/Document/passkey-test-helper/README.md`
- Test: `/home/taras/Document/passkey-test-helper/internal/helper/helper_test.go`

**Step 1: Write the failing test**

Add a Go unit test that calls the register path and expects a non-empty attestation response and credential metadata.

**Step 2: Run test to verify it fails**

Run: `cd /home/taras/Document/passkey-test-helper && go test ./...`
Expected: FAIL because helper code does not exist yet.

**Step 3: Write minimal implementation**

Add the initial package, types, and CLI skeleton. Support:
- parsing command name
- decoding JSON stdin
- encoding JSON stdout
- ES256-only registration/login stubs

**Step 4: Run test to verify it passes**

Run: `cd /home/taras/Document/passkey-test-helper && go test ./...`
Expected: PASS.

**Step 5: Commit**

```bash
cd /home/taras/Document/passkey-test-helper
git add .
git commit -m "feat: scaffold passkey test helper"
```

---

### Task 2: Implement real registration payload generation

**Files:**
- Modify: `/home/taras/Document/passkey-test-helper/internal/helper/register.go`
- Modify: `/home/taras/Document/passkey-test-helper/internal/helper/types.go`
- Modify: `/home/taras/Document/passkey-test-helper/internal/helper/helper_test.go`

**Step 1: Write the failing test**

Add a Go test that verifies:
- real key material is generated
- RP ID matches input
- clientDataJSON contains `webauthn.create`
- credential metadata is returned

**Step 2: Run test to verify it fails**

Run: `cd /home/taras/Document/passkey-test-helper && go test ./... -run TestRegisterResponse`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement the narrow real registration path:
- generate ES256 key pair
- create realistic `clientDataJSON`
- create realistic attestation/authData payload structure
- return credential metadata with signCount and private key material needed for follow-up login

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
cd /home/taras/Document/passkey-test-helper
git add .
git commit -m "feat: add registration response generation"
```

---

### Task 3: Implement real login payload generation

**Files:**
- Modify: `/home/taras/Document/passkey-test-helper/internal/helper/login.go`
- Modify: `/home/taras/Document/passkey-test-helper/internal/helper/types.go`
- Modify: `/home/taras/Document/passkey-test-helper/internal/helper/helper_test.go`

**Step 1: Write the failing test**

Add a Go test that verifies:
- a stored credential can produce an assertion response
- signCount increments
- clientDataJSON contains `webauthn.get`
- assertion uses the requested RP ID

**Step 2: Run test to verify it fails**

Run: `cd /home/taras/Document/passkey-test-helper && go test ./... -run TestLoginResponse`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement:
- loading stored credential metadata
- incrementing signCount
- generating authenticatorData
- generating a real signature over assertion data
- returning updated metadata

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
cd /home/taras/Document/passkey-test-helper
git add .
git commit -m "feat: add login response generation"
```

---

### Task 4: Add CLI end-to-end tests in the Go repo

**Files:**
- Create: `/home/taras/Document/passkey-test-helper/cmd/passkey-test-helper/main_test.go`
- Modify: `/home/taras/Document/passkey-test-helper/cmd/passkey-test-helper/main.go`

**Step 1: Write the failing test**

Add CLI tests that pipe JSON into:
- `register-response`
- `login-response`

and assert valid JSON comes back.

**Step 2: Run test to verify it fails**

Run: `cd /home/taras/Document/passkey-test-helper && go test ./cmd/passkey-test-helper`
Expected: FAIL.

**Step 3: Write minimal implementation**

Finish CLI command dispatch and stdin/stdout JSON handling.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
cd /home/taras/Document/passkey-test-helper
git add .
git commit -m "test: cover helper cli"
```

---

### Task 5: Add the helper repo here as a submodule

**Files:**
- Create: `.gitmodules`
- Create: `tools/passkey-test-helper/` (git submodule)

**Step 1: Add the submodule**

Run:
```bash
git submodule add /home/taras/Document/passkey-test-helper tools/passkey-test-helper
```

**Step 2: Verify submodule wiring**

Run: `git submodule status`
Expected: shows `tools/passkey-test-helper`.

**Step 3: Commit**

```bash
git add .gitmodules tools/passkey-test-helper
git commit -m "chore: add passkey test helper submodule"
```

---

### Task 6: Add local build-and-run wrapper in this repo

**Files:**
- Create: `tests/helpers/passkey_helper_cli.ts`
- Create: `tests/helpers/passkey_helper_build.ts`
- Test: `tests/helpers/passkey_helper_cli_test.ts`

**Step 1: Write the failing test**

Add a Deno test that calls the wrapper and expects it to:
- build the Go helper if missing
- invoke `register-response`
- return parsed JSON

**Step 2: Run test to verify it fails**

Run: `deno test tests/helpers/passkey_helper_cli_test.ts -A`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement wrapper helpers that:
- locate `tools/passkey-test-helper/`
- check binary freshness
- run `go build` when needed
- execute the helper with JSON stdin/stdout

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/helpers/passkey_helper_cli.ts tests/helpers/passkey_helper_build.ts tests/helpers/passkey_helper_cli_test.ts
git commit -m "test: add go passkey helper wrapper"
```

---

### Task 7: Switch registration tests to the Go helper

**Files:**
- Modify: `tests/http/passkey_registration_test.ts`
- Modify: `tests/helpers/test_app.ts`
- Modify: `tests/helpers/passkey_types.ts`
- Modify: `tests/helpers/passkey_helper.ts` or replace its usage with CLI wrapper

**Step 1: Write the failing test change**

Update the registration happy-path test to obtain attestation data from the Go helper instead of the fake TS generator.

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_registration_test.ts -A`
Expected: FAIL because wiring is incomplete.

**Step 3: Write minimal implementation**

Replace the registration test helper path so the Go helper generates:
- attestation response
- credential metadata

Store returned metadata in the test state for later login tests.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_registration_test.ts tests/helpers
git commit -m "test: use go helper for registration flow"
```

---

### Task 8: Switch login tests to the Go helper

**Files:**
- Modify: `tests/http/passkey_login_test.ts`
- Modify: `tests/helpers/test_app.ts`
- Modify: `tests/helpers/passkey_types.ts`
- Modify: helper wrapper files as needed

**Step 1: Write the failing test change**

Update the login happy-path test to use Go-generated assertion responses and returned updated credential metadata.

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_login_test.ts -A`
Expected: FAIL.

**Step 3: Write minimal implementation**

Wire login tests to:
- pass stored credential metadata to the Go helper
- receive assertion response
- update stored signCount metadata after login

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_login_test.ts tests/helpers
git commit -m "test: use go helper for login flow"
```

---

### Task 9: Remove or quarantine the fake TS helper

**Files:**
- Modify: `tests/helpers/passkey_helper.ts`
- Modify: `tests/helpers/passkey_helper_test.ts`
- Modify: `tests/helpers/passkey_types.ts`

**Step 1: Write the failing cleanup test or update imports**

Ensure no HTTP tests rely on the fake helper anymore.

**Step 2: Run tests to verify the old path is no longer needed**

Run: `deno test tests/http tests/helpers -A`
Expected: FAIL only if stale imports remain.

**Step 3: Write minimal cleanup**

Either:
- remove the fake helper entirely, or
- keep it only for narrow unit tests and rename it to avoid confusion

**Step 4: Run tests to verify they pass**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/helpers tests/http
git commit -m "refactor: retire fake passkey helper from http tests"
```

---

### Task 10: Run full verification

**Files:**
- Modify as needed: `tests/**`
- Modify as needed: `tools/passkey-test-helper/`
- Modify as needed: `/home/taras/Document/passkey-test-helper/**`

**Step 1: Verify Go helper repo**

Run: `cd /home/taras/Document/passkey-test-helper && go test ./...`
Expected: PASS.

**Step 2: Verify app repo passkey tests**

Run: `deno test tests/http tests/helpers -A`
Expected: PASS.

**Step 3: Verify end-to-end helper invocation**

Run a targeted happy path:
`deno test tests/http/passkey_registration_test.ts tests/http/passkey_login_test.ts -A`
Expected: PASS.

**Step 4: Commit final cleanup**

```bash
git add tests tools/passkey-test-helper
git commit -m "test: drive passkey flows with go helper"
```
