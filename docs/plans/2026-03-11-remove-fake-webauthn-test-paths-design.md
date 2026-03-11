# Remove Fake WebAuthn Test Paths

## Goal

Eliminate synthetic WebAuthn payload formats from both app code and tests so browser traffic and automated tests exercise the same verification paths.

## Decision

Adopt a single real WebAuthn-style payload path for:
- registration
- passkey enrollment
- login

Keep the Go helper, but upgrade it to emit real-enough WebAuthn wire-format payloads instead of JSON-shaped fake attestation/authenticatorData structures.

## Scope

### In scope
- `src/passkey_app.ts`
- `tools/passkey-test-helper/**`
- HTTP tests that currently rely on synthetic helper payloads
- Removal of fallback logic like JSON-parsed attestation/authenticatorData branches

### Out of scope
- adding browser E2E tests
- changing user-facing UX
- changing auth semantics beyond making verification paths real and shared

## Architecture

### Server
Use one verification path per flow:
- `/register/complete`: real registration verification only
- `/enroll/passkey/complete`: real registration verification only
- `/login/complete`: real authentication verification only

Server handlers should stop interpreting `attestationObject` or `authenticatorData` as JSON payloads.

### Test helper
Upgrade the Go helper to produce:
- real `clientDataJSON` bytes
- real binary `authenticatorData`
- real CBOR `attestationObject`
- valid assertion signatures over the same byte layout used by browsers

The helper remains the driver for HTTP tests, but its payloads must match production payload shape.

## Cleanup targets

Remove:
- `isLikelyJsonPayload(...)`
- synthetic JSON fallback branches in register/enroll completion
- synthetic login assertion parsing
- redundant old TypeScript fake helper usage where not needed

## Validation

- update HTTP tests to pass with the real helper output
- run targeted auth tests
- run full `deno test -A`
- reproduce real login locally/against deployed app if needed

## Expected result

Tests and production will share the same payload format assumptions and verification logic, preventing another class of “tests pass, browser fails” regressions.
