# Invite vs Enroll Terminology and Flow Split Design

**Goal:** Eliminate the dangerous overlap between new-user invites and same-user device enrollment by splitting routes, pages, endpoints, and wording so “invite” only means adding a user and “enroll” only means adding a passkey to an existing account.

## Problem

The current app reuses too much machinery between two different concepts:
- inviting a new user into the trust graph
- adding another passkey to an existing user

That overlap already produced a serious UX failure: a device-enrollment link routed through the generic registration page and presented account-creation language and fields. Even if the backend state remains correct, this is the wrong security posture. The flows should be obviously distinct in code and in UI.

## Terminology rules

These terms should be used consistently everywhere:

- **Invite** = create access for another user
- **Enroll** = add a passkey to an existing account

### Allowed wording

**User flow:**
- Invite user
- Invite ready
- Active invites
- Join via invite
- Create account

**Device flow:**
- Enroll passkey
- Enrollment ready
- Pending enrollments
- Add passkey to your account

### Disallowed wording

- “device invite” in product UI
- “create device invite” in product UI
- generic registration/account-creation wording on enrollment pages
- generic invite page reused for both user and device flows

## URL and endpoint model

The app should stop treating all invite tokens as one generic registration entrypoint.

### User flow

Creation:
- `POST /invites/user`

Public invite resource:
- `GET /invites/:token`

Registration:
- `POST /register/begin`
- `POST /register/complete`

Behavior:
- clicking **Invite user** immediately creates a user invite
- creator is redirected to the canonical public invite page (`/invites/:token`)
- that page is shareable
- the recipient starts account creation from that page
- no invite label or recipient name is requested at invite creation time

### Enroll flow

Creation:
- `POST /enroll/passkey`

Enrollment page:
- `GET /enroll/passkey/:token`

Enrollment endpoints:
- `POST /enroll/passkey/begin`
- `POST /enroll/passkey/complete`

Behavior:
- clicking **Enroll another passkey** immediately creates an enrollment token for the current user
- creator is redirected to the canonical enrollment page (`/enroll/passkey/:token`)
- the page shows a direct link and SVG QR code
- no username input is shown
- no account-creation language is shown
- backend logic for enroll endpoints only attaches credentials to the existing target user

## Account page behavior

The account page should become explicitly split by concept.

### Passkeys section
- heading: `Passkeys`
- primary action: `Enroll another passkey`
- list 1: enrolled passkeys
- list 2: pending enrollments

Pending enrollments should show:
- enrollment token / id
- full enrollment link

### User invite section
- heading: `Invite users`
- primary action: `Invite user`
- list of active user invites

Active user invites should show:
- invite token / id
- full public invite link

## Public page behavior

### `GET /invites/:token`
If token is a valid user invite:
- show a public shareable page
- clear heading like `You’ve been invited`
- show full invite URL
- optionally show inviter info later, but not required now
- show CTA to continue to account creation

If token is a device enrollment token:
- do not render the user invite page
- either redirect to `/enroll/passkey/:token` or return not found/invalid for this route, depending on the chosen strictness

### `GET /enroll/passkey/:token`
If token is a valid device enrollment token:
- show a passkey-enrollment page
- show full enrollment link
- show inline SVG QR code
- show clear text that this adds a passkey to an existing account

If token is a user invite:
- do not render device-enrollment UI
- either redirect to `/invites/:token` or reject

## Safety boundary

This change is not just a rename. It creates a stronger safety boundary:

- different entry pages
- different route namespaces
- different begin/complete endpoints
- different UI text
- different tests

This makes it much harder for future refactors to accidentally rejoin the flows.

## Testing expectations

Tests should prove:
- account page terminology uses `invite` only for users and `enroll` only for passkeys
- user invite creation is immediate and label-free
- enrollment creation is immediate and label-free
- `/invites/:token` renders only user-invite UI
- `/enroll/passkey/:token` renders only enrollment UI
- registration endpoints only serve user invites
- enrollment endpoints only serve device enrollment tokens
- wrong-type token on wrong route is rejected or redirected deliberately
- existing trust-chain behavior still works

## Non-goals

Not part of this design:
- invite revocation or enrollment cancellation
- displaying inviter profile metadata publicly
- auth policy changes beyond route/flow separation
- changing the underlying invite storage schema unless needed for clarity
