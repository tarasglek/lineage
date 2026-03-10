import { runLoginResponse, runRegisterResponse } from "../helpers/passkey_helper_cli.ts";
import { createTestApp } from "../helpers/test_app.ts";

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
  type StoryRegistration = { userId: string; username: string; credential: StoryCredential };
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
      body: JSON.stringify(generated.attestationResponse),
    });
    if (completeRes.status !== 200) throw new Error(`expected complete 200, got ${completeRes.status}`);
    const body = await completeRes.json();

    return {
      userId: body.userId,
      username: body.username,
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
    inviterUserId: string;
    type: "user" | "device";
    label: string;
    targetUserId?: string;
  }): Promise<StoryInvite> {
    const query = new URLSearchParams({
      inviterUserId: input.inviterUserId,
      type: input.type,
      ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
    });
    const pageRes = await t.app.request(`/invites/new?${query.toString()}`);
    if (pageRes.status !== 200) throw new Error(`expected invite page 200, got ${pageRes.status}`);
    const pageHtml = await pageRes.text();
    if (!pageHtml.includes('<form method="post" action="/invites">')) {
      throw new Error("missing invite form");
    }

    const formRes = await t.app.request("/invites", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
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
    credential: {
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
  }): Promise<void> {
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
      body: JSON.stringify(generated.assertionResponse),
    });
    if (completeRes.status !== 200) throw new Error(`expected login complete 200, got ${completeRes.status}`);
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
    inviterUserId: firstUser.userId,
    type: "device",
    label: "alice-phone",
    targetUserId: firstUser.userId,
  });
  const aliceLaptopInvite = await createInviteThroughForm({
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
    inviterUserId: firstUser.userId,
    type: "user",
    label: "bob-user",
  });

  const secondUser = await submitRegistrationForm({
    inviteToken: secondUserInvite.token,
    username: "bob",
  });

  const bobPhoneInvite = await createInviteThroughForm({
    inviterUserId: secondUser.userId,
    type: "device",
    label: "bob-phone",
    targetUserId: secondUser.userId,
  });
  const bobTabletInvite = await createInviteThroughForm({
    inviterUserId: secondUser.userId,
    type: "device",
    label: "bob-tablet",
    targetUserId: secondUser.userId,
  });
  const bobLaptopInvite = await createInviteThroughForm({
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

  await loginWithCredential({ username: firstUser.username, credential: firstUser.credential });
  await loginWithCredential({ username: firstUser.username, credential: alicePhone.credential });
  await loginWithCredential({ username: firstUser.username, credential: aliceLaptop.credential });
  await loginWithCredential({ username: secondUser.username, credential: secondUser.credential });
  await loginWithCredential({ username: secondUser.username, credential: bobPhone.credential });
  await loginWithCredential({ username: secondUser.username, credential: bobTablet.credential });
  await loginWithCredential({ username: secondUser.username, credential: bobLaptop.credential });

  assertTrustChain();
});
