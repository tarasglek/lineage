# Passkey HTTP Integration Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build red/green HTTP-level integration tests for passkey registration and login flows, with a temporary passkey helper based on the in-process software-authenticator approach (option B).

**Architecture:** The app exposes begin/complete HTTP endpoints for registration and authentication. Tests drive those endpoints end to end, persist challenge/session state, and use a passkey helper to parse returned WebAuthn options and generate valid attestation/assertion payloads. For now, the helper is an internal test-only adapter based on the option B model: realistic software-generated passkey responses without a browser.

**Tech Stack:** Deno, Hono, Deno test runner, SQLite, `@passwordless-id/webauthn` for production alignment where useful, internal test helper inspired by `descope/virtualwebauthn`, optional later Playwright smoke tests

---

## Notes and constraints

- TDD is required for every task.
- No browser-driven passkey tests in this phase.
- No static fixture-only happy-path tests as the primary strategy.
- The temporary passkey helper is explicitly **based on option B**: a software authenticator style helper used from tests.
- The helper may start narrow: only the algorithms, options, and response shapes needed by the first tests.
- Browser virtual authenticator smoke tests can be added later as a separate layer.

## External references

Use these as design references while implementing:

- `descope/virtualwebauthn`
  - strongest reference for software-generated attestation/assertion responses
- `pocket-id/pocket-id/tests/utils/passkey.util.ts`
  - later browser smoke-test reference only
- `teamhanko/hanko/backend/handler/webauthn_test.go`
  - endpoint/session/sign-count coverage ideas
- `@passwordless-id/webauthn`
  - production library alignment and payload expectations

---

### Task 1: Create the HTTP test harness skeleton

**Files:**
- Create: `tests/http/passkey_registration_test.ts`
- Create: `tests/http/passkey_login_test.ts`
- Create: `tests/helpers/test_app.ts`
- Create: `tests/helpers/test_db.ts`
- Modify: `deno.json`

**Step 1: Write the failing test**

Add a minimal test that boots the app and calls a placeholder registration begin endpoint.

```ts
Deno.test("POST /register/begin returns 404 before route exists", async () => {
  const app = await createTestApp();
  const res = await app.request("/register/begin", { method: "POST" });
  if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_registration_test.ts`
Expected: FAIL because `createTestApp` does not exist.

**Step 3: Write minimal implementation**

Create test helpers that boot a Hono app instance against a temporary SQLite database.

**Step 4: Run test to verify it passes**

Run: `deno test tests/http/passkey_registration_test.ts`
Expected: PASS with 404.

**Step 5: Commit**

```bash
git add deno.json tests/helpers/test_app.ts tests/helpers/test_db.ts tests/http/passkey_registration_test.ts tests/http/passkey_login_test.ts
git commit -m "test(http): add passkey integration test harness"
```

---

### Task 2: Add the first red registration-begin test

**Files:**
- Modify: `tests/http/passkey_registration_test.ts`
- Modify: `tests/helpers/test_app.ts`
- Modify: app route files once they exist

**Step 1: Write the failing test**

Add a test for a valid invite-driven registration begin request.

```ts
Deno.test("POST /register/begin returns WebAuthn creation options for a valid invite", async () => {
  const { app, seedInvite } = await createTestApp();
  const inviteToken = await seedInvite();

  const res = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });

  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const body = await res.json();
  if (!body.challenge) throw new Error("missing challenge");
  if (!body.user) throw new Error("missing user");
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_registration_test.ts --filter "returns WebAuthn creation options"`
Expected: FAIL with 404 or missing route.

**Step 3: Write minimal implementation**

Implement the begin-registration route with:
- invite lookup
- invite validity checks
- user stub creation or pending registration state
- challenge/session persistence
- WebAuthn creation options response

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_registration_test.ts tests/helpers/test_app.ts src
git commit -m "feat(auth): add registration begin endpoint"
```

---

### Task 3: Add invite rejection tests

**Files:**
- Modify: `tests/http/passkey_registration_test.ts`
- Modify: registration begin route files

**Step 1: Write the failing tests**

Add separate tests for:
- missing invite
- expired invite
- already-used invite
- malformed request body

**Step 2: Run tests to verify they fail**

Run: `deno test tests/http/passkey_registration_test.ts --filter "invite"`
Expected: FAIL for each new case.

**Step 3: Write minimal implementation**

Add the narrowest validation needed to return the expected HTTP status and error body.

**Step 4: Run tests to verify they pass**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_registration_test.ts src
git commit -m "test(auth): cover registration invite validation"
```

---

### Task 4: Introduce the temporary passkey helper based on option B

**Files:**
- Create: `tests/helpers/passkey_helper.ts`
- Create: `tests/helpers/passkey_types.ts`
- Create: `tests/helpers/passkey_helper_test.ts`

**Step 1: Write the failing test**

Add a helper test that parses creation options and attempts to generate a registration response.

```ts
Deno.test("passkey helper creates an attestation response from creation options", async () => {
  const options = makeCreationOptionsFixture();
  const response = await createAttestationResponse(options);
  if (!response.id) throw new Error("missing credential id");
  if (response.type !== "public-key") throw new Error("wrong type");
  if (!response.response?.clientDataJSON) throw new Error("missing clientDataJSON");
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/helpers/passkey_helper_test.ts`
Expected: FAIL because helper functions do not exist.

**Step 3: Write minimal implementation**

Create a test-only helper with this initial API:
- `createPasskeyHelper(rp: { id: string; origin: string })`
- `helper.createAttestationResponse(creationOptions)`
- `helper.createAssertionResponse(requestOptions, credential)`
- `helper.registerCredential(...)` or equivalent internal state tracking

Important note:
- this helper is intentionally **based on option B** for now
- keep scope small and test-focused
- if `@passwordless-id/webauthn` can help with payload shapes, reuse it
- if not, follow the `virtualwebauthn` model directly

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/helpers/passkey_helper.ts tests/helpers/passkey_types.ts tests/helpers/passkey_helper_test.ts
git commit -m "test(passkey): add software authenticator helper"
```

---

### Task 5: Add the first registration-complete red test

**Files:**
- Modify: `tests/http/passkey_registration_test.ts`
- Modify: `tests/helpers/passkey_helper.ts`
- Modify: registration complete route files

**Step 1: Write the failing test**

Use the begin endpoint plus the passkey helper.

```ts
Deno.test("POST /register/complete accepts a valid attestation response", async () => {
  const { app, seedInvite } = await createTestApp();
  const inviteToken = await seedInvite();

  const beginRes = await app.request("/register/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken, username: "alice" }),
  });
  const creationOptions = await beginRes.json();

  const helper = createPasskeyHelper({
    id: creationOptions.rp.id,
    origin: "http://localhost",
  });
  const attestation = await helper.createAttestationResponse(creationOptions);

  const completeRes = await app.request("/register/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(attestation),
  });

  if (completeRes.status !== 200) throw new Error(`expected 200, got ${completeRes.status}`);
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_registration_test.ts --filter "accepts a valid attestation response"`
Expected: FAIL because `/register/complete` is missing or rejects the payload.

**Step 3: Write minimal implementation**

Implement registration complete with:
- session/challenge lookup
- attestation verification
- credential persistence
- user creation finalization
- invite consumption

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_registration_test.ts tests/helpers/passkey_helper.ts src
git commit -m "feat(auth): add registration complete endpoint"
```

---

### Task 6: Add registration-complete rejection tests

**Files:**
- Modify: `tests/http/passkey_registration_test.ts`
- Modify: registration complete route files

**Step 1: Write the failing tests**

Add independent tests for:
- missing stored challenge
- wrong challenge
- replayed completion request
- reused invite
- origin mismatch
- RP ID mismatch

**Step 2: Run tests to verify they fail**

Run: `deno test tests/http/passkey_registration_test.ts --filter "register/complete"`
Expected: FAIL for the new cases.

**Step 3: Write minimal implementation**

Add only the validation needed for the tested case.

**Step 4: Run tests to verify they pass**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_registration_test.ts src
git commit -m "test(auth): cover registration completion failures"
```

---

### Task 7: Add the first login-begin red test

**Files:**
- Modify: `tests/http/passkey_login_test.ts`
- Modify: login begin route files

**Step 1: Write the failing test**

Seed a user with one credential and request assertion options.

```ts
Deno.test("POST /login/begin returns assertion options for a known account", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const user = await seedUserWithPasskey("alice");

  const res = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: user.username }),
  });

  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const body = await res.json();
  if (!body.challenge) throw new Error("missing challenge");
  if (!Array.isArray(body.allowCredentials)) throw new Error("missing allowCredentials");
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_login_test.ts --filter "returns assertion options"`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement login begin with:
- account lookup
- credential lookup
- challenge/session persistence
- assertion options response

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_login_test.ts src
git commit -m "feat(auth): add login begin endpoint"
```

---

### Task 8: Add the first login-complete red test

**Files:**
- Modify: `tests/http/passkey_login_test.ts`
- Modify: `tests/helpers/passkey_helper.ts`
- Modify: login complete route files

**Step 1: Write the failing test**

Drive begin and complete end to end.

```ts
Deno.test("POST /login/complete accepts a valid assertion response", async () => {
  const { app, seedUserWithPasskey } = await createTestApp();
  const seeded = await seedUserWithPasskey("alice");

  const beginRes = await app.request("/login/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: seeded.username }),
  });
  const requestOptions = await beginRes.json();

  const helper = seeded.passkeyHelper;
  const assertion = await helper.createAssertionResponse(requestOptions, seeded.credential);

  const completeRes = await app.request("/login/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(assertion),
  });

  if (completeRes.status !== 200) throw new Error(`expected 200, got ${completeRes.status}`);
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/passkey_login_test.ts --filter "accepts a valid assertion response"`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement login complete with:
- session/challenge lookup
- credential lookup
- assertion verification
- sign counter update
- session creation

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_login_test.ts tests/helpers/passkey_helper.ts src
git commit -m "feat(auth): add login complete endpoint"
```

---

### Task 9: Add login rejection tests

**Files:**
- Modify: `tests/http/passkey_login_test.ts`
- Modify: login complete route files

**Step 1: Write the failing tests**

Add separate tests for:
- wrong challenge
- missing session
- unknown credential id
- credential not owned by user
- counter rollback
- origin mismatch
- replayed assertion

**Step 2: Run tests to verify they fail**

Run: `deno test tests/http/passkey_login_test.ts --filter "login/complete"`
Expected: FAIL for new cases.

**Step 3: Write minimal implementation**

Add the smallest validation needed for each case.

**Step 4: Run tests to verify they pass**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_login_test.ts src
git commit -m "test(auth): cover login completion failures"
```

---

### Task 10: Add DB persistence assertions

**Files:**
- Modify: `tests/http/passkey_registration_test.ts`
- Modify: `tests/http/passkey_login_test.ts`
- Modify: `tests/helpers/test_db.ts`

**Step 1: Write the failing tests**

Add assertions that successful flows persist and update the right state:
- credential stored after registration
- invite consumed after registration
- sign counter increases after login
- auth session created after login

**Step 2: Run tests to verify they fail**

Run: `deno test tests/http/passkey_registration_test.ts tests/http/passkey_login_test.ts`
Expected: FAIL on new persistence assertions.

**Step 3: Write minimal implementation**

Add the missing persistence or state update logic.

**Step 4: Run tests to verify they pass**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/passkey_registration_test.ts tests/http/passkey_login_test.ts tests/helpers/test_db.ts src
git commit -m "test(auth): verify passkey persistence state"
```

---

### Task 11: Add helper edge-case tests

**Files:**
- Modify: `tests/helpers/passkey_helper_test.ts`
- Modify: `tests/helpers/passkey_helper.ts`

**Step 1: Write the failing tests**

Add narrow tests for the helper itself:
- rejects mismatched RP ID input
- rejects unsupported algorithm for now
- tracks sign count across assertions
- emits stable response shape expected by server verification

**Step 2: Run tests to verify they fail**

Run: `deno test tests/helpers/passkey_helper_test.ts`
Expected: FAIL for each new case.

**Step 3: Write minimal implementation**

Add only what is needed to satisfy current HTTP tests.

**Step 4: Run tests to verify they pass**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/helpers/passkey_helper_test.ts tests/helpers/passkey_helper.ts
git commit -m "test(passkey): tighten software helper behavior"
```

---

### Task 12: Run the full passkey integration test suite and clean up

**Files:**
- Modify as needed: `tests/**`
- Modify as needed: `src/**`
- Optional docs update: `SPEC.md`

**Step 1: Run the full suite**

Run: `deno test tests/http tests/helpers`
Expected: all PASS.

**Step 2: Refactor only after green**

Clean up duplicated test setup, helper naming, and route wiring without changing behavior.

**Step 3: Re-run the full suite**

Run: `deno test tests/http tests/helpers`
Expected: all PASS.

**Step 4: Commit**

```bash
git add tests src SPEC.md
git commit -m "refactor(auth): clean up passkey test support"
```

---

## Follow-up work, not part of this plan

- Add browser smoke tests using Playwright virtual authenticators
- Add cross-device/discoverable credential coverage
- Add device-invite flows
- Add OIDC login integration tests after core auth flows are stable
- Add hardware-attestation policy tests if that becomes required
