# Multi-User Device Trust Chain Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one integration test that registers two invited users with multiple devices, uses SSR UI form flows where applicable, and proves the stored invitation chain of trust.

**Architecture:** Extend the in-memory app/test state with explicit invite types, inviter relationships, and multi-credential users. Drive the story through SSR page loads and form posts for user-facing actions, while using the Go passkey helper for authenticator begin/complete payload generation. Verify both successful logins and stored trust-chain state in one end-to-end test.

**Tech Stack:** Deno, Hono, SSR HTML/forms, Go helper CLI, in-memory test state, HTTP integration tests

---

### Task 1: Add the failing SSR story test skeleton

**Files:**
- Create: `tests/http/trust_chain_story_test.ts`
- Modify: `tests/helpers/test_app.ts`

**Step 1: Write the failing test**

Add one story test with local helper stubs for:
- load bootstrap registration page
- submit registration form
- create invite through SSR form post
- register second user
- add device through form-driven flow
- login with all devices
- assert trust chain

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/trust_chain_story_test.ts -A`
Expected: FAIL because helper functions and app support do not exist yet.

**Step 3: Write minimal implementation**

Add the smallest harness support needed so the story test can compile.

**Step 4: Run test to verify it reaches the first meaningful failure**

Run the same command.
Expected: first real failing assertion.

**Step 5: Commit**

```bash
git add tests/http/trust_chain_story_test.ts tests/helpers/test_app.ts
git commit -m "test: add trust chain SSR story skeleton"
```

---

### Task 2: Add explicit root/provider and typed invites

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `tests/helpers/test_app.ts`
- Modify: story test file

**Step 1: Write the failing assertion**

Make the story test assert that the bootstrap invite belongs to provider/root and is a user invite.

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/trust_chain_story_test.ts -A`
Expected: FAIL because invite metadata is missing.

**Step 3: Write minimal implementation**

Add invite fields such as:
- `type: "user" | "device"`
- `inviterUserId`
- root/provider seed support

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS for bootstrap invite checks.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/helpers/test_app.ts tests/http/trust_chain_story_test.ts
git commit -m "feat(auth): add typed invites and provider root"
```

---

### Task 3: Add SSR pages and forms for invite/user actions

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: story test file

**Step 1: Write the failing assertions**

Make the story test load pages and submit forms for:
- initial registration entry
- create user invite
- create device invite

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/trust_chain_story_test.ts -A`
Expected: FAIL because SSR pages/forms do not exist yet.

**Step 3: Write minimal implementation**

Add SSR routes that render basic forms and process submissions for invite creation and registration entry points.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS for page/form flow assertions.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/http/trust_chain_story_test.ts
git commit -m "feat(ui): add invite and registration SSR forms"
```

---

### Task 4: Support user ancestry in registration

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `tests/helpers/test_app.ts`
- Modify: story test file

**Step 1: Write the failing assertion**

Make the story test assert:
- first user `invitedBy` is provider/root
- second user `invitedBy` is first user

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/trust_chain_story_test.ts -A`
Expected: FAIL because user ancestry is not stored.

**Step 3: Write minimal implementation**

Store inviter ancestry when completing user registration.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS for ancestry assertions.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/helpers/test_app.ts tests/http/trust_chain_story_test.ts
git commit -m "feat(auth): store inviter ancestry on user registration"
```

---

### Task 5: Support device invites and multi-credential users

**Files:**
- Modify: `src/passkey_app.ts`
- Modify: `tests/helpers/test_app.ts`
- Modify: story test file

**Step 1: Write the failing assertion**

Make the story test assert that device invites:
- add credentials to existing user
- do not create a new user
- do not change `invitedBy`

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/trust_chain_story_test.ts -A`
Expected: FAIL because device invites are not modeled.

**Step 3: Write minimal implementation**

Add device invite support:
- invite type `device`
- target existing user
- registration complete attaches credential to that user

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS for multi-device assertions.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/helpers/test_app.ts tests/http/trust_chain_story_test.ts
git commit -m "feat(auth): support device invites and multi-device users"
```

---

### Task 6: Add login checks for every registered device

**Files:**
- Modify: `tests/http/trust_chain_story_test.ts`
- Modify: `tests/helpers/test_app.ts` as needed

**Step 1: Write the failing assertion**

Extend the story so every registered credential logs in successfully.

**Step 2: Run test to verify it fails**

Run: `deno test tests/http/trust_chain_story_test.ts -A`
Expected: FAIL until the story uses all device credentials correctly.

**Step 3: Write minimal implementation**

Finish helper flow wiring so each device credential can:
- start login
- complete login
- create a session

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/http/trust_chain_story_test.ts tests/helpers/test_app.ts
git commit -m "test: verify all invited devices can login"
```

---

### Task 7: Full verification

**Files:**
- Modify as needed: `src/**`, `tests/**`

**Step 1: Run focused story test**

Run: `deno test tests/http/trust_chain_story_test.ts -A`
Expected: PASS.

**Step 2: Run full app passkey suite**

Run: `deno test tests/http tests/helpers -A`
Expected: PASS.

**Step 3: Run helper repo tests**

Run: `cd /home/taras/Document/passkey-test-helper && go test ./...`
Expected: PASS.

**Step 4: Commit**

```bash
git add src tests docs/plans
git commit -m "test: add SSR trust chain multi-device story"
```
