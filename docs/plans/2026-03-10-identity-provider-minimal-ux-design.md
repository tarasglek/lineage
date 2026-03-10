# Identity Provider Minimal UX Design

**Date:** 2026-03-10

## Goal

Define the minimal user experience for the current implementation before further LKML-style review and patch reshaping.

This document is intentionally short. It describes the desired user flow, page purpose, and terminology. It does not try to fully separate abstract system design from implementation. Each later code patch should implement the smallest testable step toward this UX.

## Product priority

The system exists primarily to manage a person’s sign-in identity.

Priority order:
1. sign in and remain signed in
2. join through bootstrap or user invitation
3. invite another user

Inviting and trust-chain management matter, but they are not the main user story on the surface.

## Core UX rules

- Prefer one obvious primary action per page.
- Keep registration invite-only.
- Make normal sign-in passkey-first.
- Keep the signed-in experience centered on identity continuity, not admin controls.
- Use precise terminology:
  - **invitation** means adding a new user
  - **add another passkey** means adding another authenticator to an existing user
- Each step should be implementable with the smallest possible tested change.

## Pages

### `/` when logged out

Purpose: entry point for an existing user.

Content:
- brief neutral product text
- primary action: **Sign in**

Do not show a general-purpose register action here.
Registration should happen only through a bootstrap or user invitation link.

### `/register?...`

Purpose: accept a bootstrap or user invitation.

Content:
- heading: **Accept invitation**
- short supporting text explaining that the user is creating an account / identity
- username field
- primary passkey creation action

On success, land directly on `/account` in an authenticated state.

### `/login`

Purpose: sign in.

Desired UX:
- heading: **Sign in**
- primary action: **Sign in with passkey**

The desired normal flow is passkey-first and does not require entering a username as the main interaction.
If current implementation temporarily still uses username-assisted mechanics, that should be treated as an implementation detail to remove or hide over time.

### `/account`

Purpose: single signed-in home/account page.

Top of page:
- heading: **Signed in as <username>**
- short neutral account summary

Main sections, in order:
1. **Passkeys**
   - list passkeys with labels when labels are available
   - primary action: **Add another passkey**
2. **Invite user**
   - lower priority than passkeys
3. lower-level details
   - existing invite records
   - trust-chain/debug details if needed

This page should remain one page rather than a dashboard with many sub-pages unless complexity forces a split later.

## Registration flow

### New user / bootstrap

1. User opens bootstrap or user invitation link.
2. User sees **Accept invitation**.
3. User chooses a username.
4. User creates a passkey.
5. User is signed in and lands on `/account`.

This is the main join flow.

## Sign-in flow

### Existing user

1. User opens `/`.
2. User clicks **Sign in**.
3. User signs in with passkey.
4. User lands on `/account`.

Username is chosen during registration, but should not be part of the primary recurring login flow.

## Additional passkey flow

This is not an invitation flow.
It is an account-management flow for an already existing user.

1. Signed-in user opens `/account`.
2. User clicks **Add another passkey**.
3. User completes passkey creation.
4. After success, user is prompted for a label.
5. The labeled passkey appears in the passkey list.

Prompting for the label after passkey creation keeps the credential ceremony simple.

## Invite-user flow

1. Signed-in user opens `/account`.
2. User finds the **Invite user** section below passkeys.
3. User creates an invitation link.
4. Recipient follows the link and enters the registration flow.

Invite-user actions are important, but they are secondary to passkey/account continuity.

## Terminology rules

Use these terms consistently in UI and review material:

- **Accept invitation**: only for a new user joining
- **Add another passkey**: add another authenticator for the same user
- avoid calling same-user authenticator enrollment an invitation
- prefer **passkey** in user-facing copy over lower-level protocol terms

## Temporary implementation mismatches to review later

The current implementation may still contain some mechanics that do not match the desired UX exactly. These should be treated as review targets, not permanent design commitments.

Likely examples:
- username-first or username-assisted login internals
- backend reuse of invite-like token machinery for same-user passkey enrollment
- account page details that are more debug-oriented than user-oriented

## Review consequence

Further LKML-style review should decompose code in the following general direction:
1. storage/schema and operations
2. HTTP/SSR surface for those operations
3. passkey/WebAuthn integration
4. UX refinements toward this target

Each patch should remain minimal, test-covered, and lintable.
