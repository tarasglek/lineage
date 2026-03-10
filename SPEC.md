# passkey invite-network

A standalone, self-hosted login and identity provider for private communities.

New accounts are created through invites, preserving a chain of trust between members instead of relying on major external identity providers or email.

Its primary use is as a standard OAuth/OIDC provider for other private apps.

Authentication uses passkeys instead of passwords because they provide phishing-resistant authentication without password storage or email-based recovery, support biometric or PIN-based local verification and hardware authenticators such as YubiKeys, and can also protect access to user key material across multiple devices. 

## Goals
- Self-hosted identity provider for private communities.
- Preserves invitation ancestry as a durable trust signal.
- Supports standard OAuth/OIDC for private apps.
- Uses passkeys instead of passwords.
- Handles user key material in a zero-trust, signal-like way so the server stores encrypted material without access to plaintext private keys or protected user data.

## Non-goals
- No open self-service registration.
- No password-based or email-based authentication.
- No dependency on major external identity providers.
- No server access to plaintext user keys or protected app data.
- Not a general-purpose application platform; remains an identity layer.

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

The uuid `0` represents the identity provider itself:
- on first start, if no users exist, an initial user invite is generated and logged
- the provider age keypair comes from env vars

Users can create invite URLs, which may also be represented as QR codes:
- user invites create a new user account in the network
- device invites add another passkey to an existing user account

Only user invites create a new uuid and extend the inviter/invitee trust graph. Device invites only add a new authentication method to an existing user.

Invites have an expiry time and may only be used once.

When a user exits the network, their keys are wiped and they are marked as purged, but their uuid is retained.

## OAuth
Exposes a minimal OAuth/OIDC integration similar to https://lastlogin.net/developers/. This includes the expected endpoints and discovery metadata, without requiring pre-registration.

Relying apps may use invite ancestry as an input to authorization decisions. For example, an app may grant access to all identities in the subtree rooted at a given uuid.

## Future
These managed age keys are intended to support future app-facing encryption features. OIDC would handle login only; app-facing encryption would require a separate integration beyond OIDC itself.

One possible design is a wallet-like cross-origin iframe or popup hosted on the identity-provider origin. Relying apps could communicate with that provider-owned context via `postMessage` or another RPC-style interface. The goal would be to let apps request limited cryptographic operations without getting direct access to plaintext key material.

The same wallet-like integration model could also expose confirmation workflows. A relying app could request confirmation of a sensitive action and receive back an assertion that the action was approved by a human authenticated as a specific identity. The identity provider could enforce additional requirements for that assertion, such as user-verifying passkeys, hardware authenticators, or subtree-specific external identity checks.

The trust graph may eventually support subtree-level policy flags.
- One possible flag would require hardware authenticators for future logins or invites.
- Another possible flag would require authentication through a specific external OIDC provider as an additional identity-verification step.
- In either case, passkeys would remain the primary authenticator.

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
