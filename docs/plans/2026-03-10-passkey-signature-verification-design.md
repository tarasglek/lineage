# Passkey Signature Verification and Helper Cleanup Design

**Date:** 2026-03-10

## Goal

Remove the fake TS passkey helper, drive tests with the Go helper only, and make the app verify real login assertion signatures instead of only checking structure and counters.

## Scope

- remove fake TS helper usage from HTTP tests
- delete the fake helper once replacement coverage exists
- add real assertion signature verification in app login flow
- keep registration validation lighter for now
- ignore `tools/.bin/` and treat it as disposable build output

## Approach

The Go helper remains the only source for valid passkey payloads in tests. Negative-path tests generate valid Go payloads and then tamper with fields directly in test code. This preserves realistic payload structure while removing reliance on a fake generator.

For login completion, the app verifies the ECDSA signature using the stored public key. The signed message is built from authenticator data plus the SHA-256 hash of `clientDataJSON`. If verification fails, the login request is rejected.

## Non-goals

- no full attestation chain verification yet
- no packed attestation trust roots
- no full WebAuthn parser rewrite

## Files expected to change

- `src/passkey_app.ts`
- `tests/http/passkey_login_test.ts`
- `tests/http/passkey_registration_test.ts`
- `tests/helpers/passkey_helper_cli.ts`
- `tests/helpers/passkey_helper_build.ts`
- `.gitignore`
- remove fake-helper files once no longer needed

## Verification goals

- tampered assertion signature is rejected
- existing login happy path still passes
- registration and login tests still pass with Go-generated payloads only
- `tools/.bin/` no longer pollutes git status
