# Multi-User Multi-Device Trust Chain Integration Design

**Date:** 2026-03-10

## Goal

Add one end-to-end integration test that proves multi-device registration and login across two invited users, while also verifying the stored invitation trust chain in DB state.

## Scenario

One integration story will prove:

1. bootstrap initial user invite exists
2. first user registers from the bootstrap/root invite
3. first user adds a couple of devices through device invites
4. first user creates a user invite
5. second user registers from that user invite
6. second user adds a few devices through device invites
7. every registered device can log in
8. DB state shows the trust chain correctly

## Trust-chain assertions

The test must verify:
- provider/root invited first user
- first user record points back to provider/root
- second user record points back to first user
- the user invite used for second user was created by first user
- device invites do not create new users or alter the inviter chain
- device invites only add credentials to the existing user

## SSR/UI constraint

Because the app is SSR-first, the integration story should prefer UI-shaped flows where user interaction exists.

That means the test should drive:
- GET page loads
- HTML form submissions
- redirect/render transitions

instead of using JSON routes directly for invite and user-action flows.

Passkey begin/complete can still use helper-driven authenticator payloads where needed, but the surrounding actions should be exercised through SSR UI routes and form posts.

## Approach

Keep this as one integration test with a few local helper functions for readability:
- bootstrap/register user
- create invite through SSR form
- add device through SSR form-driven flow
- login with device
- assert trust chain

The Go helper remains the source of valid passkey payloads. Negative-path behavior is out of scope for this story; this is a success-path and stored-state proof.

## Minimal model support needed

The app/test state likely needs explicit support for:
- root/provider identity
- user invites vs device invites
- `invitedBy` on user records
- invite records with inviter and type
- multiple credentials per user
- SSR pages/forms for invite creation and user/device registration entry points

## Scope

- one integration test
- SSR page + form driven where user input exists
- no browser
- Go helper for all passkey registration/login payloads
- explicit DB/state assertions for invite ancestry
