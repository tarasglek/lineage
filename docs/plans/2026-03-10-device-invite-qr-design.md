# Device Invite QR UX Design

**Goal:** Make “Add another passkey” create a device invite immediately and show a focused enrollment page with a link and inline SVG QR code, while the account page shows both enrolled passkeys and active device invite links.

## Summary

The current device invite flow is too indirect. It sends the user to `/invites/new?type=device...`, asks for a label, and only then creates the invite. That makes sense for inviting another user, but not for enrolling another passkey on the same account.

The new UX treats device invites as a self-service enrollment action:
- click **Add another passkey** on `/account`
- server creates a device invite immediately
- response renders a page with the enrollment link, invite ID, and inline SVG QR code
- `/account` shows enrolled credential IDs and active device invite links together in the passkeys section

User invites remain a separate flow.

## Approach options

### Option 1: Minimal reuse
Keep the existing generic invite-created page, but change device invites to be created immediately and add a QR code there.

**Pros:** small change
**Cons:** keeps device enrollment conceptually mixed with generic invite UX

### Option 2: Dedicated device enrollment page
Create a focused page for device enrollment results and a direct POST route for device invite creation.

**Pros:** cleanest mental model, clearer wording, good long-term separation
**Cons:** slightly more page/template work

### Option 3: Inline account-page result
Create the device invite from `/account` and render the result inline on the same page.

**Pros:** fewer pages
**Cons:** clutters account view and complicates repeated creation behavior

## Recommendation

Use **Option 2**.

This keeps the product model clear:
- **Invite user** = create an invite for another person
- **Add another passkey** = create a same-user enrollment link

## UX details

### `/account`

The passkeys section should contain:
1. a button/form to create a device invite immediately
2. a list of enrolled credential IDs
3. a list of active device invite IDs with full enrollment links

Only active device invites should appear in the pending list:
- type = `device`
- inviter is current user
- target user is current user
- `usedAt === null`
- `expiresAt > Date.now()`

The separate user invite section remains below it.

### Device invite result page

The result page should contain:
- heading like **Add another passkey**
- short explanation telling the user to open the link on the device they want to enroll
- full enrollment link as text and clickable anchor
- invite ID/token
- inline SVG QR code generated server-side from the enrollment URL
- back-to-account link

No label field is shown anywhere for device invites.

## Server/API shape

Add a dedicated authenticated POST route, for example:
- `POST /invites/device`

Behavior:
- require authenticated user
- create a `device` invite with `inviterUserId = currentUser.id`
- set `targetUserId = currentUser.id`
- no label required
- expiry remains the current 24-hour TTL unless intentionally changed later
- render the device invite result page directly

Keep existing user invite behavior under:
- `GET /invites/new?type=user`
- `POST /invites`

The current generic `/invites/new?type=device...` page should no longer be used from the account UI.

## QR rendering

Use a small server-side QR library that can output SVG directly. The SVG should be embedded inline into the SSR page so there is no client-side QR generation dependency.

Selection criteria:
- works in Deno via npm import
- generates SVG string directly
- actively used/popular enough to avoid custom QR code logic

## Testing

Add or update HTTP tests to verify:
- unauthenticated `POST /invites/device` redirects to `/login`
- authenticated device invite creation succeeds
- result page contains the enrollment link
- result page contains inline SVG QR markup
- stored invite is `type=device`, targets current user, and has expected TTL
- `/account` shows enrolled credentials and active device invite links
- used or expired device invites do not appear in pending device invite list
- account page no longer links to `/invites/new?type=device...`

## Non-goals

Not part of this change:
- invite revocation UI
- invite labels for device invites
- QR thumbnails on the account page
- changing user invite semantics
- changing bootstrap/provider-root behavior
