# passkey invite-network

A standalone login and identity provider for private communities.

Users authenticate with passkeys, not passwords. New accounts are created through invites, forming a chain of trust between members rather than relying on external identity providers like Google.

The system can also act as a standard OAuth provider so that other private apps can delegate authentication to it.

- a network that works like lobste.rs to setup a private identity system disconnected from major identity providers like google, etc
- each user has:
    * a unique username
    * optional email which we dont check via confirmation and dont expose anywhere yet
    * uuid
    * uuid invited-by of user who invited them
    * set of passkey identities that can be used to login
    * a set (>=1) of age private keys encrypted to the user's passkey identities per https://words.filippo.io/passkey-encryption/; we use age multi-recipient encryption, and every time we add a passkey, we re-encrypt the private keys
    * this is meant to be zero-trust / signal-like: the server stores encrypted key material and should have no access to users' plaintext private keys or application data
    * in the future, apps using this OIDC provider can rely on these identities for encryption as well as login, without giving the identity provider access to user data
- uuid of 0 represents the system
    * at first start if no users in system or invites an invite for a user is generated and logged
    * pub/private age key comes from env vars
- users can create invite urls (also available as QR codes)
    * there are two kinds of invite urls:
      - user invite: creates a new user account in the network
      - device invite: adds another passkey to an existing user account
    * a device invite can be used to add, for example, a phone passkey and a desktop passkey to the same user
    * only user invites create a new uuid and extend the inviter/invitee trust graph
    * device invites only add a new authentication method to an existing user
- invites
   * invites have an expiry time
   * they can only be used once
- network exit
   * since this is a chain of trust, exit means we wipe all keys and mark user as purged, but we keep their uuid

## OAuth
- We will exposed minimal outh integration ala https://lastlogin.net/developers/
- eg endpoints, .well-known, no pre-registration

## Tech stack:
* deno impl to start with
* uuids are all v6
* future impl should work on cloudflare workers
* hono to abstract server runtime, hono html template  literals https://hono.dev/docs/helpers/html and for fully functional components (eg SSR)
* static/ directory for static css/html/headers/footers/etc
* mobile-friendly css
* latest vite
* https://github.com/passwordless-id/webauthn is the core of our auth
* https://docs.deno.com/api/node/sqlite/ for db
* https://words.filippo.io/passkey-encryption/ for encryption