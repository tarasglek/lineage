# JWT Auth Polish Design

**Date:** 2026-03-10

## Goal

Finish the next auth slice with:
- token hardening
- complete SSR login/logout flow around JSON WebAuthn
- storage boundaries that prepare the app for durable backing stores

## Auth behavior

### JWT stays the transport format
Use JWT for:
- auth session cookie
- register flow state
- login flow state

### DB/storage remains source of truth
Persistent truth still lives in storage:
- users
- credentials
- invites
- inviter ancestry
- signCount

JWT does not replace persistent truth.

## SSR behavior

Use SSR for normal page/form flow:
- `GET /login`
- `POST /login`
- `GET /login/passkey`
- `POST /logout`
- `GET /invites/new`
- `GET /account`

Use JSON for WebAuthn ceremony:
- `/register/begin`
- `/register/complete`
- `/login/begin`
- `/login/complete`

### Unauthenticated SSR policy
Protected SSR pages should redirect to `/login` instead of returning 401 HTML.

This applies to:
- `/invites/new`
- `/account`

## Token hardening

Add stricter behavior for:
- expired auth JWT
- invalid auth JWT
- wrong issuer/audience/type
- expired flow JWT
- invalid flow JWT

Expose this through HTTP tests, not just helper-level tests.

## Login/logout SSR flow

### Login page
`GET /login` renders a form that submits username.

### Login handoff page
`POST /login` redirects to `/login/passkey?username=...`

`GET /login/passkey` renders a page that holds the username for the client-side passkey step.

### Login completion
`/login/complete` still returns JSON and sets the auth cookie.

### Logout
`POST /logout` clears the auth cookie.

## Storage prep

Introduce small storage boundaries for:
- users
- credentials
- invites

Keep an in-memory implementation for tests.

The goal is not a production DB migration yet. The goal is to remove direct map coupling from route logic so a later durable implementation is straightforward.

## Testing

Add tests for:
- protected SSR pages redirect to `/login`
- SSR login page and redirect flow work
- logout clears cookie
- expired/invalid auth cookie behavior on protected pages
- expired/invalid flow JWT behavior on ceremony endpoints
- storage-backed app still passes trust-chain tests

## Result

After this slice:
- auth flow is more complete for real SSR app usage
- token handling is stricter and better tested
- app logic is easier to move to durable storage later
