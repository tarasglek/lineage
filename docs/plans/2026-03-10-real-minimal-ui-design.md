# Real Minimal UI Design

**Date:** 2026-03-10

## Goal

Replace placeholder SSR passkey pages with a minimal but actually usable browser UI for:
- registration
- login
- account view
- invite creation
- invite consumption bootstrap flow

## Constraints

- Keep the existing route structure where possible.
- Keep SSR pages as the outer shell.
- Use small inline browser JavaScript only where WebAuthn requires it.
- Do not introduce a full SPA or frontend framework.
- Preserve the existing HTTP API and test coverage where possible.

## Chosen approach

Use SSR pages plus tiny inline JavaScript on the passkey pages.

This keeps the server-rendered flow while making passkey registration/login work in a real browser:
- `/register/passkey` runs `navigator.credentials.create()`
- `/login/passkey` runs `navigator.credentials.get()`
- success redirects to `/account`
- failures render inline status text

## UI scope

### `/`
Landing page with:
- brief project description
- login link
- account link when authenticated
- logout button when authenticated

### `/register`
SSR form with:
- invite token
- username
- submit button
- clear heading and explanatory text

### `/register/passkey`
Real registration page with:
- visible invite/user summary
- primary “Create passkey” button
- status box
- inline JS that calls begin/complete endpoints and redirects to `/account`

### `/login`
SSR username form with:
- heading
- username input
- submit button

### `/login/passkey`
Real login page with:
- visible username
- primary “Sign in with passkey” button
- status box
- inline JS that calls begin/complete endpoints and redirects to `/account`

### `/account`
Human-readable account page with:
- username
- inviter id (if any)
- credentials list
- created invites list
- buttons/links to create user or device invites
- logout form

### `/invites/new`
Usable invite form with:
- invite type
- label
- target user hidden field for device invites
- explanatory text

### `/invites`
Create invite response page with:
- generated invite URL
- copyable raw token/value
- link back to account

## Browser JS behavior

### Registration
1. Read `inviteToken` and `username` from SSR page data attributes.
2. POST `/register/begin`.
3. Convert creation options into browser WebAuthn format.
4. Call `navigator.credentials.create()`.
5. Convert result into JSON payload.
6. POST `/register/complete`.
7. Redirect to `/account`.

### Login
1. Read `username` from SSR page data attributes.
2. POST `/login/begin`.
3. Convert request options into browser WebAuthn format.
4. Call `navigator.credentials.get()`.
5. Convert result into JSON payload.
6. POST `/login/complete`.
7. Redirect to `/account`.

## Error handling

Show readable inline errors for:
- missing username/invite
- invite expired/used
- browser does not support WebAuthn
- user cancels passkey prompt
- backend errors returned as `{ error }`

## Testing

Add/update HTTP tests to verify:
- `/` renders a useful landing page
- `/register/passkey` contains a real action button/script marker, not placeholder text only
- `/login/passkey` contains a real action button/script marker, not placeholder text only
- `/account` contains usable links/forms for follow-up actions
- `/invites` response shows a usable invite URL

## Out of scope

- polished design system
- client-side hydration framework
- QR code generation
- copy-to-clipboard niceties beyond basic HTML
- advanced session management

## Result

A fresh user can:
1. get bootstrap invite link
2. open registration page
3. create a passkey in a real browser
4. reach account page
5. create user/device invites
6. log out and log back in using passkey
