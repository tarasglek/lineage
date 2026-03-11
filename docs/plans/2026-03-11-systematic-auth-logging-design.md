# Systematic Auth and Flow Logging Design

**Goal:** Make diagnostics systematic across the app’s important interactive routes so every meaningful decision point logs a structured stdout event, making production failures directly explain themselves instead of requiring inference.

## Problem

The current logging is still too ad hoc. A few checkpoints were added around auth, but not every failure branch. That means debugging still depends on guessing which branch fired based on what log entry did not appear.

For a production auth flow with many early returns, that is not acceptable. The rule should be simple: if the app is about to reject, redirect, persist, or succeed in an important flow, it should emit one structured event first.

## Scope

Log systematically for important app routes only, not static assets.

Included routes:
- `/account`
- `/login`
- `/logout`
- `/login/begin`
- `/login/complete`
- `/register`
- `/register/begin`
- `/register/complete`
- `/invites/:token`
- `/invites/user`
- `/enroll/passkey`
- `/enroll/passkey/:token`
- `/enroll/passkey/begin`
- `/enroll/passkey/complete`

Excluded:
- CSS/JS asset routes
- unrelated landing page asset fetches

## Logging rules

### Structured stdout only
All diagnostics should go to stdout as structured JSON lines via `console.log(...)`.

### Include raw IDs
For this debugging phase, logs should include raw:
- invite tokens
- credential IDs
- user IDs
- usernames

Do not include:
- JWTs
- cookies
- private keys
- public key material
- full attestation/assertion payloads

### Every meaningful branch logs
Each important route should log before:
- returning an error
- redirecting for auth failure
- persisting state
- returning success

## Event model

Use a consistent shape like:

```json
{
  "type": "app-diagnostic",
  "time": "2026-03-11T...Z",
  "cwd": "/home/taras/smallweb/devices",
  "event": "login_complete_invalid_signature",
  "host": "devices.coolness.fyi",
  "credentialId": "...",
  "userId": "...",
  "username": "...",
  "inviteToken": "...",
  "userCount": 2,
  "credentialCount": 1,
  "inviteCount": 2,
  "sessionCount": 0
}
```

## Minimum route coverage

### `/account`
- authenticated user found
- auth missing/invalid and redirecting to login

### `/login/begin`
- request start
- username lookup miss
- username lookup hit
- discoverable-login path selected
- credentials enumerated for user
- success response

### `/login/complete`
Log every early-return branch explicitly:
- missing flow token
- invalid assertion
- flow token expired
- invalid flow token
- authentication session not found
- origin mismatch
- credential not found
- credential missing public key
- rp id mismatch
- user handle mismatch
- credential not owned by user
- sign count rollback
- invalid signature
- user not found
- success

### `/register/begin`
- missing invite token
- missing username
- invite not found
- wrong invite type
- invite already used
- invite expired
- success

### `/register/complete`
- missing flow token
- invalid attestation
- flow token expired
- invalid flow token
- registration session not found
- invite already used
- wrong invite type
- origin mismatch
- rp id mismatch
- username taken
- persistence success
- success

### `/enroll/passkey/begin`
- missing invite token
- invite not found
- wrong invite type
- invite already used
- invite expired
- missing target user
- target user not found
- success

### `/enroll/passkey/complete`
- missing flow token
- invalid attestation
- flow token expired
- invalid flow token
- registration session not found
- invite already used
- wrong invite type
- origin mismatch
- rp id mismatch
- target user not found
- persistence success
- success

### Invite/enroll creation/resource routes
- unauthenticated redirect
- token not found / wrong type
- invite created
- enrollment created
- public invite page rendered
- enrollment page rendered

## Storage snapshot policy

At each important event, include a storage snapshot:
- `userCount`
- `credentialCount`
- `inviteCount`
- `sessionCount`

This allows correlation of failures with state drift.

## Non-goals

Not part of this change:
- changing auth logic itself
- fixing the runtime bug yet
- adding debug endpoints
- writing to a separate log sink
