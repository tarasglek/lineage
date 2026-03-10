# JWT Trust Chain Design

**Date:** 2026-03-10

## Goal

Finish chain-of-trust enforcement and verification with JWT-backed auth sessions, JWT-backed passkey flow state, stronger abuse/tamper tests, and SSR visibility of trust relationships.

## Core split

### DB remains source of truth
Persistent state stays in DB/state:
- users
- credentials
- invites
- inviter ancestry
- invite consumption
- signCount

### JWT auth session
Use an HttpOnly cookie for authenticated user identity.
This is used to protect SSR invite routes and to derive the inviter from the current session instead of trusting form input.

### JWT flow state
Use short-lived signed JWTs for:
- register flow state
- login flow state

These replace server-side temporary challenge/session storage for the WebAuthn ceremony.
The WebAuthn challenge/response payload itself stays standard JSON.

## SSR and JSON boundary

Use SSR for normal app flow:
- registration page
- login page
- invite creation page
- account/trust-chain page

Use JSON for WebAuthn ceremony:
- `/register/begin`
- `/register/complete`
- `/login/begin`
- `/login/complete`

SSR pages can carry flow context and final redirect behavior, but passkey challenge/response stays JSON.

## Authorization rules

Invite creation must enforce:
- authenticated session required
- inviter derived from auth JWT only
- posted inviter id is ignored or rejected
- user invites are created by the current user
- device invites can only target the current user unless a stronger explicit policy is later added

## Verification scope

### Positive story
Keep the existing two-user multi-device trust-chain story green under the new auth/session model.

### Abuse and tamper tests
Add tests for:
- unauthenticated invite page/action rejected
- forged inviter input rejected or ignored
- device invite with wrong target rejected
- expired flow token rejected
- tampered flow token rejected
- wrong flow token type rejected

### SSR visibility
Add an SSR page that exposes enough trust state to verify:
- who invited the current user
- invites created by the current user
- credentials/devices on the account

## JWT library

Use `jose` as the minimal popular JWT library for Deno/runtime compatibility.

## Result

After this slice:
- trust-chain creation is authorized
- flow integrity is stateless and serverless-friendly
- trust-chain data is visible in SSR
- tests cover both happy path and abuse path
