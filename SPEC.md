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
    * a set (>=1) of age private keys encrypted with ^ identities per https://words.filippo.io/passkey-encryption/, eg we use age multi-recipient encryption, every time we add a passkey, we re-encrypt private keys
- uuid of 0 represents the system
    * at first start if no users in system or invites an invite for a user is generated and logged
    * pub/private age key comes from env vars
- user can invite via urls(also available as QR codes)
    * invite urls cause a passkey registration
    * an invite link can lead registration can be for another passkey for this user..eg to have a pass key for phone and another for desktop
    * an invite link can be used to setup a new user...
- invites
   * invites have an expiry time
   * they can only be used once
- network exit
   * since this is a chain of trust, exit means we wipe all keys and mark user as purged, but we keep their uuid


## registration
- By default homepage requires pre-registered passkey to login
- if we one goes to /register then it lets one register a passkey. this url is not advertied....one registers device name and associated pubkey
- registrations go into data/registrations.yaml which is a list og name+pubkey
- there is also a data/users.yaml which is a list of users that are validated
- if you login and you are not in users.yaml...then you are shown  'in registration queue'
- once someone moves you into users.yanl you see full app

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