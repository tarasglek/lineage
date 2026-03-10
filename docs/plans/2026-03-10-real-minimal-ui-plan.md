# Real Minimal UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the current passkey app actually usable in a browser by replacing placeholder SSR pages with minimal real UI and inline WebAuthn browser flows.

**Architecture:** Keep SSR routes and existing JSON begin/complete endpoints. Add inline browser JS only to the passkey pages. Improve `/`, `/account`, and invite result pages for human use.

**Tech Stack:** Deno, Hono, SSR HTML, browser WebAuthn API, SQLite, existing JWT/session flow

---

### Task 1: Add page-level red tests for usable UI

**Files:**
- Modify: `tests/http/ssr_login_flow_test.ts`
- Modify: `tests/http/trust_chain_visibility_test.ts`
- Create: `tests/http/landing_page_test.ts`
- Modify: invite/account tests as needed

**Step 1: Write failing tests**

Cover:
- `/` renders useful landing page content
- `/login/passkey` includes a real passkey action button/script marker
- `/register/passkey` includes a real passkey action button/script marker
- `/account` includes usable invite/logout navigation
- `/invites` success response includes a usable invite URL

**Step 2: Run focused tests to verify failure**

Run:
- `deno test tests/http/landing_page_test.ts tests/http/ssr_login_flow_test.ts tests/http/trust_chain_visibility_test.ts tests/http/invite_authorization_test.ts -A`

Expected: FAIL.

**Step 3: Implement minimal SSR UI**

Update route HTML only, no browser JS yet.

**Step 4: Run focused tests to verify pass**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/http/landing_page_test.ts tests/http/ssr_login_flow_test.ts tests/http/trust_chain_visibility_test.ts tests/http/invite_authorization_test.ts
git commit -m "feat(ui): add usable ssr pages"
```

---

### Task 2: Wire real browser passkey registration/login pages

**Files:**
- Modify: `src/passkey_app.ts`
- Add inline browser JS helpers in rendered pages
- Modify tests as needed

**Step 1: Add/update failing tests**

Add assertions that passkey pages contain the required script/action wiring markers for begin/create/complete and begin/get/complete.

**Step 2: Run focused tests to verify failure**

Run:
- `deno test tests/http/ssr_login_flow_test.ts tests/http/passkey_registration_test.ts tests/http/passkey_login_test.ts -A`

Expected: FAIL.

**Step 3: Implement minimal browser WebAuthn wiring**

On `/register/passkey` and `/login/passkey`:
- add button
- add status box
- add inline JS to call begin/complete endpoints and redirect on success

**Step 4: Run focused tests to verify pass**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/passkey_app.ts tests/http/ssr_login_flow_test.ts tests/http/passkey_registration_test.ts tests/http/passkey_login_test.ts
git commit -m "feat(ui): wire browser passkey flows"
```

---

### Task 3: Full verification and README alignment

**Files:**
- Modify: `README.md` if route descriptions need updates
- Modify: `src/**`, `tests/**`

**Step 1: Run full verification**

Run:
- `deno test tests/http tests/helpers -A`
- `cd /home/taras/Document/passkey-test-helper && go test ./...`

Expected: PASS.

**Step 2: Update README wording if needed**

Make sure setup instructions match the actual usable UI flow.

**Step 3: Commit final follow-up**

```bash
git add README.md src tests
git commit -m "feat(ui): finish minimal browser app"
```
