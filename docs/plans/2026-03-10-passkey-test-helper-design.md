# Passkey Test Helper Design

**Date:** 2026-03-10

## Goal

Use a real cryptographic passkey test helper, implemented as a separate Go repository, to drive HTTP integration tests through actual passkey codepaths.

## Repo structure

- standalone repo: `~/Document/passkey-test-helper/`
- added to this repo as a submodule at `tools/passkey-test-helper/`

This keeps the helper reusable and versioned independently while letting this repo pin a known-good revision.

## Architecture

The Go project provides:
- a library that implements authenticator-style WebAuthn test operations
- a tiny CLI wrapper for use from Deno tests

This repo provides:
- a small wrapper that auto-builds the helper if needed
- test helpers that invoke the compiled binary
- HTTP integration tests that pass begin options into the helper and POST generated complete payloads back into the app

## CLI shape

First version will support two commands:

- `register-response`
  - input: credential creation options JSON and RP origin
  - output: attestation response JSON and credential metadata JSON

- `login-response`
  - input: credential request options JSON, stored credential metadata JSON, and RP origin
  - output: assertion response JSON and updated credential metadata JSON

The helper stays mostly stateless per invocation. Tests keep returned credential metadata and pass it back for later calls.

## Test flow

### Registration
1. call `POST /register/begin`
2. pass returned options to the Go helper
3. receive attestation response + stored credential metadata
4. POST attestation response to `POST /register/complete`
5. keep credential metadata for later login tests

### Login
1. call `POST /login/begin`
2. pass returned request options and stored credential metadata to the Go helper
3. receive assertion response + updated credential metadata
4. POST assertion response to `POST /login/complete`
5. verify sign counter and session state

## Scope

First implementation is intentionally narrow:
- ES256 only
- no browser
- no resident-key matrix beyond what current tests need
- no hardware attestation policy handling
- enough real crypto to test actual passkey codepaths

## Requirements

The helper must:
- generate real key material
- generate realistic attestation/assertion payloads
- enforce RP ID and origin consistency
- track signCount through credential metadata
- emit JSON payloads that the app can consume directly in tests

## Integration details

Submodule location in this repo:
- `tools/passkey-test-helper/`

Recommended local wrapper responsibilities:
- build binary if missing or stale
- invoke with JSON stdin/stdout
- surface stderr on failure

## Why this approach

This replaces the fake TS helper with a real cryptographic generator while keeping the app tests fast enough and deterministic. It also avoids browser automation and keeps the authenticator logic isolated from the app repo.
