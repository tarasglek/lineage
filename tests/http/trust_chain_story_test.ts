import { runLoginResponse, runRegisterResponse } from "../helpers/passkey_helper_cli.ts";
import { createTestApp } from "../helpers/test_app.ts";

// Story:
// - provider root bootstraps Alice with a user invite
// - Alice adds two more devices and invites Bob
// - Bob registers, adds three more devices, and all devices log in
// - the test proves SSR invite pages use real auth cookies, WebAuthn uses JSON begin/complete,
//   device invites attach to the existing user, and inviter ancestry is stored correctly
Deno.test("SSR trust chain story covers two invited users and many devices", async () => {
  const t = await createTestApp();
  type StoryCredential = {
    id: string;
    userId: string;
    rpId: string;
    algorithm: number;
    publicKey: string;
    publicKeyPem?: string;
    privateKeyPem?: string;
    signCount: number;
    transports?: string[];
  };
  type StoryRegistration = { userId: string; username: string; credential: StoryCredential; authCookie: string };
  type StoryInvite = { token: string; type: "user" | "device"; inviterUserId: string | null; targetUserId?: string };

  async function loadBootstrapRegistrationPage(): Promise<void> {
    const invite = t.state.invites.get(t.bootstrapInviteToken);
    if (!invite) throw new Error("missing bootstrap invite");
    if (invite.type !== "user") throw new Error(`expected user invite, got ${invite.type}`);
    if (invite.inviterUserId !== t.providerRootUserId) {
      throw new Error(`expected bootstrap inviter ${t.providerRootUserId}, got ${invite.inviterUserId}`);
    }
  }

  async function submitRegistrationForm(input: {
    inviteToken: string;
    username: string;
    origin?: string;
  }): Promise<StoryRegistration> {
    const pageRes = await t.app.request(`/register?inviteToken=${encodeURIComponent(input.inviteToken)}`);
    if (pageRes.status !== 200) throw new Error(`expected register page 200, got ${pageRes.status}`);
    const pageHtml = await pageRes.text();
    if (!pageHtml.includes('<form method="post" action="/register">')) {
      throw new Error("missing register form");
    }

    const formRes = await t.app.request("/register", {
      method: "POST",
      body: new URLSearchParams({ inviteToken: input.inviteToken, username: input.username }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "manual",
    });
    if (formRes.status !== 303) throw new Error(`expected register form redirect, got ${formRes.status}`);
    const location = formRes.headers.get("location");
    if (!location) throw new Error("missing register redirect location");

    const passkeyPageRes = await t.app.request(location);
    if (passkeyPageRes.status !== 200) throw new Error(`expected passkey page 200, got ${passkeyPageRes.status}`);

    const beginRes = await t.app.request("/register/begin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteToken: input.inviteToken, username: input.username }),
    });
    if (beginRes.status !== 200) throw new Error(`expected begin 200, got ${beginRes.status}`);
    const creationOptions = await beginRes.json();
    const generated = await runRegisterResponse({
      origin: input.origin ?? "http://localhost",
      creationOptions,
    });
    const completeRes = await t.app.request("/register/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...generated.attestationResponse, flowToken: creationOptions.flowToken }),
    });
    if (completeRes.status !== 200) throw new Error(`expected complete 200, got ${completeRes.status}`);
    const authCookie = completeRes.headers.get("set-cookie");
    if (!authCookie) throw new Error("missing registration auth cookie");
    const body = await completeRes.json();

    return {
      userId: body.userId,
      username: body.username,
      authCookie,
      credential: {
        id: generated.credential.id,
        userId: body.userId,
        rpId: generated.credential.rpId,
        algorithm: generated.credential.algorithm,
        publicKey: generated.credential.publicKey,
        publicKeyPem: generated.credential.publicKeyPem,
        privateKeyPem: generated.credential.privateKeyPem,
        signCount: generated.credential.signCount,
        transports: ["internal"],
      },
    };
  }

  async function createInviteThroughForm(input: {
    authCookie: string;
    inviterUserId: string;
    type: "user" | "device";
    label: string;
    targetUserId?: string;
  }): Promise<StoryInvite> {
    const query = new URLSearchParams({
      type: input.type,
      ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
    });
    const pageRes = await t.app.request(`/invites/new?${query.toString()}`, {
      headers: { cookie: input.authCookie },
    });
    if (pageRes.status !== 200) throw new Error(`expected invite page 200, got ${pageRes.status}`);
    const pageHtml = await pageRes.text();
    if (!pageHtml.includes('<form method="post" action="/invites">')) {
      throw new Error("missing invite form");
    }

    const formRes = await t.app.request("/invites", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: input.authCookie,
      },
      body: new URLSearchParams({
        inviterUserId: input.inviterUserId,
        type: input.type,
        label: input.label,
        targetUserId: input.targetUserId ?? "",
      }),
    });
    if (formRes.status !== 200) throw new Error(`expected invite create 200, got ${formRes.status}`);
    const html = await formRes.text();
    const tokenMatch = html.match(/data-token="([^"]+)"/);
    if (!tokenMatch) throw new Error("missing invite token in response");

    return {
      token: tokenMatch[1],
      type: input.type,
      inviterUserId: input.inviterUserId,
      targetUserId: input.targetUserId,
    };
  }

  async function loginWithCredential(input: {
    username: string;
    credential: StoryCredential;
  }): Promise<string> {
    const sessionsBefore = t.state.sessions.length;
    const beginRes = await t.app.request("/login/begin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: input.username }),
    });
    if (beginRes.status !== 200) throw new Error(`expected login begin 200, got ${beginRes.status}`);
    const requestOptions = await beginRes.json();
    const generated = await runLoginResponse({
      origin: "http://localhost",
      requestOptions,
      credential: input.credential,
    });
    const completeRes = await t.app.request("/login/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...generated.assertionResponse, flowToken: requestOptions.flowToken }),
    });
    if (completeRes.status !== 200) throw new Error(`expected login complete 200, got ${completeRes.status}`);
    const authCookie = completeRes.headers.get("set-cookie");
    if (!authCookie) throw new Error("missing login auth cookie");
    const body = await completeRes.json();
    if (body.userId !== input.credential.userId) {
      throw new Error(`expected login userId ${input.credential.userId}, got ${body.userId}`);
    }
    if (body.credentialId !== input.credential.id) {
      throw new Error(`expected login credentialId ${input.credential.id}, got ${body.credentialId}`);
    }
    if (body.username !== input.username) {
      throw new Error(`expected login username ${input.username}, got ${body.username}`);
    }
    const sessionsAfter = t.state.sessions.length;
    if (sessionsAfter !== sessionsBefore + 1) {
      throw new Error(`expected sessions to increment from ${sessionsBefore} to ${sessionsBefore + 1}, got ${sessionsAfter}`);
    }
    return authCookie;
  }

  async function assertAccountPage(authCookie: string, expected: {
    username: string;
    invitedBy?: string | null;
    credentialCount: number;
    inviteTokens: string[];
  }) {
    const res = await t.app.request("/account", {
      headers: { cookie: authCookie },
    });
    if (res.status !== 200) throw new Error(`expected account page 200, got ${res.status}`);
    const html = await res.text();
    if (!html.includes(`data-username="${expected.username}"`)) throw new Error("missing account username");
    const invitedBy = expected.invitedBy ?? "";
    if (!html.includes(`data-invited-by="${invitedBy}"`)) throw new Error("missing account invitedBy");
    const credentialMatches = html.match(/data-credential-id="/g) ?? [];
    if (credentialMatches.length !== expected.credentialCount) {
      throw new Error(`expected ${expected.credentialCount} credentials on account page, got ${credentialMatches.length}`);
    }
    for (const inviteToken of expected.inviteTokens) {
      if (!html.includes(`data-invite-token="${inviteToken}"`)) {
        throw new Error(`missing invite ${inviteToken} on account page`);
      }
    }
  }

  function assertTrustChain(): void {
    const rootUser = t.state.users.get(t.providerRootUserId);
    if (!rootUser) throw new Error("missing provider root user");
    if (rootUser.invitedBy !== null) throw new Error("provider root should not have inviter");

    const aliceUser = t.state.users.get(firstUser.userId);
    if (!aliceUser) throw new Error("missing first user");
    if (aliceUser.invitedBy !== t.providerRootUserId) {
      throw new Error(`expected alice invitedBy ${t.providerRootUserId}, got ${aliceUser.invitedBy}`);
    }

    const bobUser = t.state.users.get(secondUser.userId);
    if (!bobUser) throw new Error("missing second user");
    if (bobUser.invitedBy !== firstUser.userId) {
      throw new Error(`expected bob invitedBy ${firstUser.userId}, got ${bobUser.invitedBy}`);
    }

    const secondUserInviteState = t.state.invites.get(secondUserInvite.token);
    if (!secondUserInviteState) throw new Error("missing second user invite");
    if (secondUserInviteState.type !== "user") throw new Error("second user invite should be user type");
    if (secondUserInviteState.inviterUserId !== firstUser.userId) {
      throw new Error("second user invite should be created by first user");
    }
    if (secondUserInviteState.usedAt === null) throw new Error("second user invite should be consumed");

    for (const deviceInvite of [alicePhoneInvite, aliceLaptopInvite, bobPhoneInvite, bobTabletInvite, bobLaptopInvite]) {
      const invite = t.state.invites.get(deviceInvite.token);
      if (!invite) throw new Error(`missing device invite ${deviceInvite.token}`);
      if (invite.type !== "device") throw new Error(`expected device invite for ${deviceInvite.token}`);
      if (invite.usedAt === null) throw new Error(`device invite ${deviceInvite.token} should be consumed`);
    }

    const aliceCredentials = Array.from(t.state.credentials.values()).filter((credential) => credential.userId === firstUser.userId);
    const bobCredentials = Array.from(t.state.credentials.values()).filter((credential) => credential.userId === secondUser.userId);
    if (aliceCredentials.length !== 3) throw new Error(`expected 3 alice credentials, got ${aliceCredentials.length}`);
    if (bobCredentials.length !== 4) throw new Error(`expected 4 bob credentials, got ${bobCredentials.length}`);

    if (t.state.users.size !== 3) throw new Error(`expected 3 users including root, got ${t.state.users.size}`);
    if (t.state.sessions.length !== 7) throw new Error(`expected 7 login sessions, got ${t.state.sessions.length}`);
  }

  await loadBootstrapRegistrationPage();

  const firstUser = await submitRegistrationForm({
    inviteToken: t.bootstrapInviteToken,
    username: "alice",
  });

  const alicePhoneInvite = await createInviteThroughForm({
    authCookie: firstUser.authCookie,
    inviterUserId: firstUser.userId,
    type: "device",
    label: "alice-phone",
    targetUserId: firstUser.userId,
  });
  const aliceLaptopInvite = await createInviteThroughForm({
    authCookie: firstUser.authCookie,
    inviterUserId: firstUser.userId,
    type: "device",
    label: "alice-laptop",
    targetUserId: firstUser.userId,
  });

  const alicePhone = await submitRegistrationForm({
    inviteToken: alicePhoneInvite.token,
    username: firstUser.username,
  });
  if (alicePhone.userId !== firstUser.userId) throw new Error("alice phone should attach to first user");
  const aliceLaptop = await submitRegistrationForm({
    inviteToken: aliceLaptopInvite.token,
    username: firstUser.username,
  });
  if (aliceLaptop.userId !== firstUser.userId) throw new Error("alice laptop should attach to first user");
  const usersAfterAliceDevices = t.state.users.size;
  if (usersAfterAliceDevices !== 2) throw new Error(`expected root + alice after alice devices, got ${usersAfterAliceDevices}`);

  const secondUserInvite = await createInviteThroughForm({
    authCookie: firstUser.authCookie,
    inviterUserId: firstUser.userId,
    type: "user",
    label: "bob-user",
  });

  const secondUser = await submitRegistrationForm({
    inviteToken: secondUserInvite.token,
    username: "bob",
  });

  const bobPhoneInvite = await createInviteThroughForm({
    authCookie: secondUser.authCookie,
    inviterUserId: secondUser.userId,
    type: "device",
    label: "bob-phone",
    targetUserId: secondUser.userId,
  });
  const bobTabletInvite = await createInviteThroughForm({
    authCookie: secondUser.authCookie,
    inviterUserId: secondUser.userId,
    type: "device",
    label: "bob-tablet",
    targetUserId: secondUser.userId,
  });
  const bobLaptopInvite = await createInviteThroughForm({
    authCookie: secondUser.authCookie,
    inviterUserId: secondUser.userId,
    type: "device",
    label: "bob-laptop",
    targetUserId: secondUser.userId,
  });

  const bobPhone = await submitRegistrationForm({
    inviteToken: bobPhoneInvite.token,
    username: secondUser.username,
  });
  if (bobPhone.userId !== secondUser.userId) throw new Error("bob phone should attach to second user");
  const bobTablet = await submitRegistrationForm({
    inviteToken: bobTabletInvite.token,
    username: secondUser.username,
  });
  if (bobTablet.userId !== secondUser.userId) throw new Error("bob tablet should attach to second user");
  const bobLaptop = await submitRegistrationForm({
    inviteToken: bobLaptopInvite.token,
    username: secondUser.username,
  });
  if (bobLaptop.userId !== secondUser.userId) throw new Error("bob laptop should attach to second user");
  const usersAfterBobDevices = t.state.users.size;
  if (usersAfterBobDevices !== 3) throw new Error(`expected root + two users after bob devices, got ${usersAfterBobDevices}`);

  const aliceLoginCookie = await loginWithCredential({ username: firstUser.username, credential: firstUser.credential });
  await loginWithCredential({ username: firstUser.username, credential: alicePhone.credential });
  await loginWithCredential({ username: firstUser.username, credential: aliceLaptop.credential });
  const bobLoginCookie = await loginWithCredential({ username: secondUser.username, credential: secondUser.credential });
  await loginWithCredential({ username: secondUser.username, credential: bobPhone.credential });
  await loginWithCredential({ username: secondUser.username, credential: bobTablet.credential });
  await loginWithCredential({ username: secondUser.username, credential: bobLaptop.credential });

  await assertAccountPage(aliceLoginCookie, {
    username: firstUser.username,
    invitedBy: t.providerRootUserId,
    credentialCount: 3,
    inviteTokens: [alicePhoneInvite.token, aliceLaptopInvite.token, secondUserInvite.token],
  });
  await assertAccountPage(bobLoginCookie, {
    username: secondUser.username,
    invitedBy: firstUser.userId,
    credentialCount: 4,
    inviteTokens: [bobPhoneInvite.token, bobTabletInvite.token, bobLaptopInvite.token],
  });

  assertTrustChain();
});
