# Systematic Auth and Flow Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured stdout diagnostics to every important decision point in the app’s auth, invite, enroll, and account flows so production failures are directly identifiable from logs.

**Architecture:** Centralize diagnostic emission in a small helper in `src/passkey_app.ts`, reuse a shared storage snapshot helper, and add event logs before every meaningful early return, redirect, persistence step, and success response in the important interactive routes. Keep logs on stdout only and include raw IDs needed to debug production mismatches.

**Tech Stack:** Deno, Hono, existing route handlers in `src/passkey_app.ts`, stdout JSON logs via `console.log`, Deno tests.

---

### Task 1: Add failing tests for systematic logging on critical login branches

**Files:**
- Modify: `tests/http/passkey_login_test.ts`
- Modify: `tests/http/auth_session_test.ts`

**Step 1: Add a test for `credential_not_found` logging**

Capture stdout while hitting the existing unknown-credential test path and assert the output includes an event like:

```ts
"event":"login_complete_credential_not_found"
```

**Step 2: Add a test for auth redirect logging**

In `tests/http/auth_session_test.ts`, assert an unauthenticated `/account` request emits an event like:

```ts
"event":"account_auth_missing_or_invalid"
```

**Step 3: Add a test for login success logging**

Extend the successful login test to assert stdout includes:

```ts
"event":"login_complete_success"
```

**Step 4: Run tests to verify failure**

Run:
```bash
deno test tests/http/passkey_login_test.ts tests/http/auth_session_test.ts -A
```

Expected: FAIL because not every branch logs yet.

**Step 5: Commit**

```bash
git add tests/http/passkey_login_test.ts tests/http/auth_session_test.ts
git commit -m "test(logging): define systematic login diagnostics"
```

### Task 2: Centralize diagnostics helper usage and auth redirect logging

**Files:**
- Modify: `src/passkey_app.ts`
- Test: `tests/http/auth_session_test.ts`

**Step 1: Keep one shared logging helper**

Use the existing structured log helper and storage snapshot helper. Ensure every emitted event includes:
- `type`
- `time`
- `cwd`
- `event`
- route-relevant ids and counts

**Step 2: Log auth redirect decisions**

Before returning redirect for protected pages, emit explicit events such as:
- `account_auth_missing_or_invalid`
- `invite_user_auth_missing_or_invalid`
- `enroll_passkey_auth_missing_or_invalid`

**Step 3: Run auth-session tests**

Run:
```bash
deno test tests/http/auth_session_test.ts -A
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/passkey_app.ts tests/http/auth_session_test.ts
git commit -m "feat(logging): log auth redirect decisions"
```

### Task 3: Log every branch in `/login/begin` and `/login/complete`

**Files:**
- Modify: `src/passkey_app.ts`
- Test: `tests/http/passkey_login_test.ts`

**Step 1: Add explicit `/login/begin` branch logs**

Log events for:
- `login_begin_start`
- `login_begin_invalid_json`
- `login_begin_user_not_found`
- `login_begin_username_lookup`
- `login_begin_credentials_for_user`
- `login_begin_discoverable`
- `login_begin_success`

**Step 2: Add explicit `/login/complete` branch logs before every return**

Add logs for:
- `login_complete_missing_flow_token`
- `login_complete_invalid_assertion`
- `login_complete_flow_token_expired`
- `login_complete_invalid_flow_token`
- `login_complete_authentication_session_not_found`
- `login_complete_origin_mismatch`
- `login_complete_credential_not_found`
- `login_complete_credential_missing_public_key`
- `login_complete_rp_id_mismatch`
- `login_complete_user_handle_mismatch`
- `login_complete_credential_not_owned_by_user`
- `login_complete_sign_count_rollback`
- `login_complete_invalid_signature`
- `login_complete_user_not_found`
- `login_complete_success`

**Step 3: Run login tests**

Run:
```bash
deno test tests/http/passkey_login_test.ts -A
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/passkey_app.ts tests/http/passkey_login_test.ts
git commit -m "feat(logging): cover login branches systematically"
```

### Task 4: Log every branch in register flow

**Files:**
- Modify: `src/passkey_app.ts`
- Test: `tests/http/passkey_registration_test.ts`

**Step 1: Add `/register/begin` branch logs**

Log:
- `register_begin_start`
- `register_begin_invalid_json`
- `register_begin_missing_invite_token`
- `register_begin_missing_username`
- `register_begin_invite_not_found`
- `register_begin_wrong_invite_type`
- `register_begin_invite_already_used`
- `register_begin_invite_expired`
- `register_begin_success`

**Step 2: Add missing `/register/complete` branch logs**

Ensure explicit logs exist for every early return, including:
- `register_complete_missing_flow_token`
- `register_complete_invalid_attestation`
- `register_complete_flow_token_expired`
- `register_complete_invalid_flow_token`
- `register_complete_registration_session_not_found`
- `register_complete_invite_already_used`
- `register_complete_wrong_invite_type`
- `register_complete_origin_mismatch`
- `register_complete_rp_id_mismatch`
- `register_complete_username_taken`
- `register_complete_persisted`
- `register_complete_success`

**Step 3: Run register tests**

Run:
```bash
deno test tests/http/passkey_registration_test.ts -A
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/passkey_app.ts tests/http/passkey_registration_test.ts
git commit -m "feat(logging): cover registration branches systematically"
```

### Task 5: Log every branch in enroll flow

**Files:**
- Modify: `src/passkey_app.ts`
- Test: `tests/http/enrollment_flow_test.ts`

**Step 1: Add `/enroll/passkey/begin` branch logs**

Log:
- `enroll_begin_start`
- `enroll_begin_invalid_json`
- `enroll_begin_missing_invite_token`
- `enroll_begin_invite_not_found`
- `enroll_begin_wrong_invite_type`
- `enroll_begin_invite_already_used`
- `enroll_begin_invite_expired`
- `enroll_begin_missing_target_user`
- `enroll_begin_target_user_not_found`
- `enroll_begin_success`

**Step 2: Add missing `/enroll/passkey/complete` branch logs**

Ensure explicit logs exist for every early return, including:
- `enroll_complete_missing_flow_token`
- `enroll_complete_invalid_attestation`
- `enroll_complete_flow_token_expired`
- `enroll_complete_invalid_flow_token`
- `enroll_complete_registration_session_not_found`
- `enroll_complete_invite_already_used`
- `enroll_complete_wrong_invite_type`
- `enroll_complete_origin_mismatch`
- `enroll_complete_rp_id_mismatch`
- `enroll_complete_target_user_not_found`
- `enroll_complete_persisted`
- `enroll_complete_success`

**Step 3: Run enroll tests**

Run:
```bash
deno test tests/http/enrollment_flow_test.ts -A
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/passkey_app.ts tests/http/enrollment_flow_test.ts
git commit -m "feat(logging): cover enrollment branches systematically"
```

### Task 6: Log invite/account route outcomes

**Files:**
- Modify: `src/passkey_app.ts`
- Test: `tests/http/invite_authorization_test.ts`
- Test: `tests/http/trust_chain_visibility_test.ts`
- Test: `tests/http/ssr_login_flow_test.ts`

**Step 1: Add logs for invite/account routes**

Log explicit events for:
- `account_view_success`
- `invite_resource_not_found`
- `invite_resource_rendered`
- `invite_user_created`
- `enroll_resource_not_found`
- `enroll_resource_rendered`
- `enroll_created`
- auth redirect variants for protected POST routes

**Step 2: Run affected tests**

Run:
```bash
deno test tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts tests/http/ssr_login_flow_test.ts -A
```

Expected: PASS.

**Step 3: Commit**

```bash
git add src/passkey_app.ts tests/http/invite_authorization_test.ts tests/http/trust_chain_visibility_test.ts tests/http/ssr_login_flow_test.ts
git commit -m "feat(logging): cover invite and account route outcomes"
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

**Step 2: Spot-check real log ergonomics**

Trigger one successful registration and one failed login path locally if possible, then verify logs are readable and specific.

**Step 3: Review diff**

Run:
```bash
git status --short
git diff --stat
```

Expected: only intended logging/test files changed.

**Step 4: Commit any final fixups if needed**

```bash
git add .
git commit -m "test: verify systematic auth diagnostics"
```

Only if verification required a final code adjustment.
