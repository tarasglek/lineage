import {
  runLoginResponse,
  runRegisterResponse,
} from "../helpers/passkey_helper_cli.ts";
import { createTestApp } from "../helpers/test_app.ts";

// Story:
// - provider root bootstraps Alice with a user invite
// - Alice enrolls two more passkeys and invites Bob
// - Bob registers, enrolls three more passkeys, and all devices log in
// - the test proves SSR invite pages use real auth cookies, WebAuthn uses JSON begin/complete,
//   enrollment tokens attach to the existing user, and inviter ancestry is stored correctly
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
  type StoryRegistration = {
    userId: string;
    username: string;
    credential: StoryCredential;
    authCookie: string;
  };
  type StoryInvite = {
    token: string;
    type: "user" | "device";
    inviterUserId: string | null;
    targetUserId?: string;
  };

  function loadBootstrapRegistrationPage(): void {
    const invite = t.getInvite(t.bootstrapInviteToken);
    if (!invite) throw new Error("missing bootstrap invite");
    if (invite.type !== "user") {
      throw new Error(`expected user invite, got ${invite.type}`);
    }
    if (invite.inviterUserId !== t.providerRootUserId) {
      throw new Error(
        `expected bootstrap inviter ${t.providerRootUserId}, got ${invite.inviterUserId}`,
      );
    }
  }

  async function submitRegistrationForm(input: {
    inviteToken: string;
    username: string;
    origin?: string;
  }): Promise<StoryRegistration> {
    const invite = t.getInvite(input.inviteToken);
    if (!invite) throw new Error("missing invite state");

    const isEnroll = invite.type === "device";
    const pagePath = isEnroll
      ? `/enroll/passkey/${encodeURIComponent(input.inviteToken)}`
      : `/register?inviteToken=${encodeURIComponent(input.inviteToken)}&username=${encodeURIComponent(input.username)}`;
    const pageRes = await t.app.request(pagePath);
    if (pageRes.status !== 200) {
      throw new Error(`expected register page 200, got ${pageRes.status}`);
    }
    const pageHtml = await pageRes.text();
    if (!pageHtml.includes(`data-invite-token="${input.inviteToken}"`)) {
      throw new Error("missing invite token");
    }
    if (!isEnroll) {
      if (!pageHtml.includes(`data-username="${input.username}"`)) {
        throw new Error("missing username");
      }
      if (!pageHtml.includes('id="username"')) {
        throw new Error("missing username input");
      }
    }

    const beginRes = await t.app.request(
      isEnroll ? "/enroll/passkey/begin" : "/register/begin",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isEnroll
            ? { inviteToken: input.inviteToken }
            : { inviteToken: input.inviteToken, username: input.username },
        ),
      },
    );
    if (beginRes.status !== 200) {
      throw new Error(`expected begin 200, got ${beginRes.status}`);
    }
    const creationOptions = await beginRes.json();
    const generated = await runRegisterResponse({
      origin: input.origin ?? "http://localhost",
      creationOptions,
    });
    const completeRes = await t.app.request(
      isEnroll ? "/enroll/passkey/complete" : "/register/complete",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...generated.attestationResponse,
          flowToken: creationOptions.flowToken,
        }),
      },
    );
    if (completeRes.status !== 200) {
      throw new Error(`expected complete 200, got ${completeRes.status}`);
    }
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
    const path = input.type === "user" ? "/invites/user" : "/enroll/passkey";
    const formRes = await t.app.request(path, {
      method: "POST",
      headers: {
        cookie: input.authCookie,
      },
      redirect: "manual",
    });
    if (formRes.status !== 303) {
      throw new Error(`expected invite create 303, got ${formRes.status}`);
    }
    const location = formRes.headers.get("location");
    const token = location?.split("/").at(-1);
    if (!token) throw new Error("missing invite token in response");

    return {
      token,
      type: input.type,
      inviterUserId: input.inviterUserId,
      targetUserId: input.targetUserId,
    };
  }

  async function loginWithCredential(input: {
    username: string;
    credential: StoryCredential;
  }): Promise<string> {
    const sessionsBefore = t.listSessions().length;
    const beginRes = await t.app.request("/login/begin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: input.username }),
    });
    if (beginRes.status !== 200) {
      throw new Error(`expected login begin 200, got ${beginRes.status}`);
    }
    const requestOptions = await beginRes.json();
    const generated = await runLoginResponse({
      origin: "http://localhost",
      requestOptions,
      credential: input.credential,
    });
    const completeRes = await t.app.request("/login/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...generated.assertionResponse,
        flowToken: requestOptions.flowToken,
      }),
    });
    if (completeRes.status !== 200) {
      throw new Error(`expected login complete 200, got ${completeRes.status}`);
    }
    const authCookie = completeRes.headers.get("set-cookie");
    if (!authCookie) throw new Error("missing login auth cookie");
    const body = await completeRes.json();
    if (body.userId !== input.credential.userId) {
      throw new Error(
        `expected login userId ${input.credential.userId}, got ${body.userId}`,
      );
    }
    if (body.credentialId !== input.credential.id) {
      throw new Error(
        `expected login credentialId ${input.credential.id}, got ${body.credentialId}`,
      );
    }
    if (body.username !== input.username) {
      throw new Error(
        `expected login username ${input.username}, got ${body.username}`,
      );
    }
    const sessionsAfter = t.listSessions().length;
    if (sessionsAfter !== sessionsBefore + 1) {
      throw new Error(
        `expected sessions to increment from ${sessionsBefore} to ${
          sessionsBefore + 1
        }, got ${sessionsAfter}`,
      );
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
    if (res.status !== 200) {
      throw new Error(`expected account page 200, got ${res.status}`);
    }
    const html = await res.text();
    if (!html.includes(`data-username="${expected.username}"`)) {
      throw new Error("missing account username");
    }
    const invitedBy = expected.invitedBy ?? "";
    if (!html.includes(`data-invited-by="${invitedBy}"`)) {
      throw new Error("missing account invitedBy");
    }
    const credentialMatches = html.match(/data-credential-id="/g) ?? [];
    if (credentialMatches.length !== expected.credentialCount) {
      throw new Error(
        `expected ${expected.credentialCount} credentials on account page, got ${credentialMatches.length}`,
      );
    }
    for (const inviteToken of expected.inviteTokens) {
      if (!html.includes(`data-invite-token="${inviteToken}"`)) {
        throw new Error(`missing invite ${inviteToken} on account page`);
      }
    }
  }

  function assertTrustChain(): void {
    const rootUser = t.getUser(t.providerRootUserId);
    if (!rootUser) throw new Error("missing provider root user");
    if (rootUser.invitedBy !== null) {
      throw new Error("provider root should not have inviter");
    }

    const aliceUser = t.getUser(firstUser.userId);
    if (!aliceUser) throw new Error("missing first user");
    if (aliceUser.invitedBy !== t.providerRootUserId) {
      throw new Error(
        `expected alice invitedBy ${t.providerRootUserId}, got ${aliceUser.invitedBy}`,
      );
    }

    const bobUser = t.getUser(secondUser.userId);
    if (!bobUser) throw new Error("missing second user");
    if (bobUser.invitedBy !== firstUser.userId) {
      throw new Error(
        `expected bob invitedBy ${firstUser.userId}, got ${bobUser.invitedBy}`,
      );
    }

    const secondUserInviteState = t.getInvite(secondUserInvite.token);
    if (!secondUserInviteState) throw new Error("missing second user invite");
    if (secondUserInviteState.type !== "user") {
      throw new Error("second user invite should be user type");
    }
    if (secondUserInviteState.inviterUserId !== firstUser.userId) {
      throw new Error("second user invite should be created by first user");
    }
    if (secondUserInviteState.usedAt === null) {
      throw new Error("second user invite should be consumed");
    }

    for (
      const deviceInvite of [
        alicePhoneInvite,
        aliceLaptopInvite,
        bobPhoneInvite,
        bobTabletInvite,
        bobLaptopInvite,
      ]
    ) {
      const invite = t.getInvite(deviceInvite.token);
      if (!invite) {
        throw new Error(`missing enrollment token ${deviceInvite.token}`);
      }
      if (invite.type !== "device") {
        throw new Error(`expected enrollment token for ${deviceInvite.token}`);
      }
      if (invite.usedAt === null) {
        throw new Error(
          `enrollment token ${deviceInvite.token} should be consumed`,
        );
      }
    }

    const aliceCredentials = t.listCredentials().filter((credential) =>
      credential.userId === firstUser.userId
    );
    const bobCredentials = t.listCredentials().filter((credential) =>
      credential.userId === secondUser.userId
    );
    if (aliceCredentials.length !== 3) {
      throw new Error(
        `expected 3 alice credentials, got ${aliceCredentials.length}`,
      );
    }
    if (bobCredentials.length !== 4) {
      throw new Error(
        `expected 4 bob credentials, got ${bobCredentials.length}`,
      );
    }

    if (t.listUsers().length !== 3) {
      throw new Error(
        `expected 3 users including root, got ${t.listUsers().length}`,
      );
    }
    if (t.listSessions().length !== 7) {
      throw new Error(
        `expected 7 login sessions, got ${t.listSessions().length}`,
      );
    }
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
  if (alicePhone.userId !== firstUser.userId) {
    throw new Error("alice phone should attach to first user");
  }
  const aliceLaptop = await submitRegistrationForm({
    inviteToken: aliceLaptopInvite.token,
    username: firstUser.username,
  });
  if (aliceLaptop.userId !== firstUser.userId) {
    throw new Error("alice laptop should attach to first user");
  }
  const usersAfterAliceDevices = t.listUsers().length;
  if (usersAfterAliceDevices !== 2) {
    throw new Error(
      `expected root + alice after alice devices, got ${usersAfterAliceDevices}`,
    );
  }

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
  if (bobPhone.userId !== secondUser.userId) {
    throw new Error("bob phone should attach to second user");
  }
  const bobTablet = await submitRegistrationForm({
    inviteToken: bobTabletInvite.token,
    username: secondUser.username,
  });
  if (bobTablet.userId !== secondUser.userId) {
    throw new Error("bob tablet should attach to second user");
  }
  const bobLaptop = await submitRegistrationForm({
    inviteToken: bobLaptopInvite.token,
    username: secondUser.username,
  });
  if (bobLaptop.userId !== secondUser.userId) {
    throw new Error("bob laptop should attach to second user");
  }
  const usersAfterBobDevices = t.listUsers().length;
  if (usersAfterBobDevices !== 3) {
    throw new Error(
      `expected root + two users after bob devices, got ${usersAfterBobDevices}`,
    );
  }

  const aliceLoginCookie = await loginWithCredential({
    username: firstUser.username,
    credential: firstUser.credential,
  });
  await loginWithCredential({
    username: firstUser.username,
    credential: alicePhone.credential,
  });
  await loginWithCredential({
    username: firstUser.username,
    credential: aliceLaptop.credential,
  });
  const bobLoginCookie = await loginWithCredential({
    username: secondUser.username,
    credential: secondUser.credential,
  });
  await loginWithCredential({
    username: secondUser.username,
    credential: bobPhone.credential,
  });
  await loginWithCredential({
    username: secondUser.username,
    credential: bobTablet.credential,
  });
  await loginWithCredential({
    username: secondUser.username,
    credential: bobLaptop.credential,
  });

  await assertAccountPage(aliceLoginCookie, {
    username: firstUser.username,
    invitedBy: t.providerRootUserId,
    credentialCount: 3,
    inviteTokens: [
      alicePhoneInvite.token,
      aliceLaptopInvite.token,
      secondUserInvite.token,
    ],
  });
  await assertAccountPage(bobLoginCookie, {
    username: secondUser.username,
    invitedBy: firstUser.userId,
    credentialCount: 4,
    inviteTokens: [
      bobPhoneInvite.token,
      bobTabletInvite.token,
      bobLaptopInvite.token,
    ],
  });

  assertTrustChain();
});
