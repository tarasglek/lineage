# Lineage invite-network

A self-hosted passkey-based identity provider for private communities.

Lineage uses invite-only account creation and preserves invitation ancestry as a
long-lived trust graph. Instead of open signup, passwords, or major external
identity providers, access enters the network through explicit invites. User
invites create new identities, while device invites add more passkeys to an
existing identity.

The project is intended to become a minimal OAuth/OIDC-style identity provider
for private apps, with trust-chain information available as an authorization
signal.

## Current shape

Today, the app includes:
- passkey registration and login flows
- SSR login, registration, account, and invite pages
- JWT-backed auth/session cookies
- SQLite persistence in `./data/users.sqlite`
- bootstrap invite seeding on first startup

## TL;DR setup

### 1. Start the app

However you run your Deno app in this repo, make sure it starts `main.ts`.

Example:

```bash
deno run -A main.ts
```

### 2. Get the bootstrap invite link

On first startup, the app seeds a bootstrap invite in `./data/users.sqlite`.
Print a usable registration URL with:

```bash
deno task bootstrap-invite
```

Or with your deployed base URL:

```bash
deno task bootstrap-invite https://your-domain.example
```

That prints a link like:

```text
https://your-domain.example/register?inviteToken=...
```

### 3. Open the printed link

Use that link to register the first real user with a passkey.

### 4. Keep using the app

After registration/login:
- `/login` starts login
- `/account` shows the current account and trust-chain details
- `/invites/new` creates more user or device invites

## Reverse proxy note

For deployment behind a reverse proxy, the app derives WebAuthn origin/RP
context from these headers:
- `X-Forwarded-Proto`
- `X-Forwarded-Host`

Your proxy should set them correctly, especially for HTTPS deployments.

## Project model

The core model is an invite-preserving trust graph:
- each user has a UUID and an inviter
- user invites create new accounts in the network
- device invites add more passkeys to an existing account
- invite ancestry is stored durably and can be used as a trust signal

Longer-term, the goal is a self-hosted identity provider for private apps with
passkeys as the primary authenticator and invitation lineage as part of the
authorization story.
