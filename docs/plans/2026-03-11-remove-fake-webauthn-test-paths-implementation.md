# Remove Fake WebAuthn Test Paths Implementation Plan

## Goal
Remove synthetic WebAuthn payload parsing from app code and make the Go helper generate real WebAuthn-style register/login payloads so tests and browser traffic hit the same verification paths.

## Task 1: Upgrade Go helper payloads
- Modify `tools/passkey-test-helper/internal/helper/register.go`
- Modify `tools/passkey-test-helper/internal/helper/login.go`
- Add any small dependency/code needed for CBOR and authenticatorData encoding
- Ensure register output includes real CBOR attestation object and authenticator data
- Ensure login output includes real authenticatorData bytes and valid signature over them

## Task 2: Remove server fake fallback paths
- Modify `src/passkey_app.ts`
- Remove `isLikelyJsonPayload(...)`
- Remove JSON-parsed attestation fallback in `/register/complete`
- Remove JSON-parsed attestation fallback in `/enroll/passkey/complete`
- Replace `/login/complete` parsing with the same real assertion verification model used by browser payloads

## Task 3: Update tests to rely on the real helper path
- Modify auth/passkey HTTP tests as needed
- Remove assumptions tied to JSON-shaped `authenticatorData` / `attestationObject`
- Keep branch coverage and diagnostics assertions intact

## Task 4: Verify
- Run targeted auth tests
- Run `deno test -A`
- If needed, inspect local/deployed logs for one manual login attempt
