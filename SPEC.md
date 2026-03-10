# passkey invite-network

A standalone, self-hosted login and identity provider for private communities.

Users authenticate with passkeys instead of passwords. New accounts are created through invites, so the system preserves a chain of trust between members instead of relying on major external identity providers or email. The system's primary use is like a standard OAuth/OIDC provider for other private apps.

Passkeys are used because they provide phishing-resistant authentication without passwords or email-based recovery, support local biometric or PIN verification and hardware authenticators such as YubiKeys, and can also protect access to user key material across multiple devices.

## Goals
- The system should be a self-hosted identity provider for private communities.
- The system should use passkeys instead of passwords.
- The system should preserve invitation ancestry as a durable trust signal.
- The system should support standard OAuth/OIDC for private apps.
- The system should handle user key material in a zero-trust, signal-like way so that the server stores encrypted material without access to plaintext private keys or protected user data.

## Non-goals
- The system is not intended to support open self-service registration.
- The system is not intended to support password-based or email-based authentication.
- The system is not intended to depend on major external identity providers.
- The system is not intended to give the server access to plaintext user keys or protected app data.
- The system is not intended to become a general-purpose application platform rather than an identity layer.

## Core model
Invitation relationships are preserved as a long-lived trust graph. This makes it possible to trace how access entered the network and to prune abusive branches when necessary. Self-invites are allowed, which lets users intentionally create additional descendants under their own identity.

Each user has:
- a unique username
- an optional email address, which is not currently verified or exposed
- a uuid
- the uuid of the user who invited them
- a set of passkey identities that can be used to log in
- a set (>=1) of age private keys encrypted to the user's passkey identities per https://words.filippo.io/passkey-encryption/; we use age multi-recipient encryption, and every time we add a passkey, we re-encrypt the private keys

This key handling is meant to be zero-trust / signal-like. The server stores encrypted key material and should not have access to users' plaintext private keys or application data.

The uuid `0` represents the system itself:
- on first start, if no users exist, an initial user invite is generated and logged
- the system age keypair comes from env vars

Users can create invite URLs, which may also be represented as QR codes:
- user invites create a new user account in the network
- device invites add another passkey to an existing user account

Only user invites create a new uuid and extend the inviter/invitee trust graph. Device invites only add a new authentication method to an existing user.

Invites have an expiry time and may only be used once.

When a user exits the network, their keys are wiped and they are marked as purged, but their uuid is retained.

## OAuth
The system should expose a minimal OAuth/OIDC integration similar to https://lastlogin.net/developers/. This includes the expected endpoints and discovery metadata, without requiring pre-registration.

Relying apps may use invite ancestry as an input to authorization decisions. For example, an app may grant access to all identities in the subtree rooted at a given uuid.

## Future
These managed age keys are intended to support future app-facing encryption features. OIDC would handle login only; app-facing encryption would require a separate integration beyond OIDC itself.

One possible design is a wallet-like cross-origin iframe or popup hosted on the identity-provider origin. Relying apps could communicate with that provider-owned context via `postMessage` or another RPC-style interface. The goal would be to let apps request limited cryptographic operations without getting direct access to plaintext key material.

### Potential implementation paths
- A browser-standards path could follow evolving browser and WebAuthn support for cross-origin embedded auth or crypto flows.
- A cross-origin wallet path could use an embedded-wallet style design with an iframe or popup on the identity-provider origin and a narrow RPC API.
- A public-key directory path could expose user public encryption keys and related metadata to relying apps while keeping private key operations on the user side.
- A hybrid path could use OIDC for authentication, public keys for simple encryption cases, and iframe/RPC mechanisms for more sensitive operations.

## Tech stack
- deno impl to start with
- uuids are all v6
- future impl should work on cloudflare workers
- hono to abstract server runtime, hono html template literals https://hono.dev/docs/helpers/html and for fully functional components (eg SSR)
- static/ directory for static css/html/headers/footers/etc
- mobile-friendly css
- latest vite
- https://github.com/passwordless-id/webauthn is the core of our auth
- https://docs.deno.com/api/node/sqlite/ for db
- https://words.filippo.io/passkey-encryption/ for encryption
