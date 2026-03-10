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
    throw new Error("not implemented");
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
  const aliceLaptop = await submitRegistrationForm({
    inviteToken: aliceLaptopInvite.token,
    username: firstUser.username,
  });

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
  const bobTablet = await submitRegistrationForm({
    inviteToken: bobTabletInvite.token,
    username: secondUser.username,
  });
  const bobLaptop = await submitRegistrationForm({
    inviteToken: bobLaptopInvite.token,
    username: secondUser.username,
  });

  await loginWithCredential({ username: firstUser.username, credential: firstUser.credential });
  await loginWithCredential({ username: firstUser.username, credential: alicePhone.credential });
  await loginWithCredential({ username: firstUser.username, credential: aliceLaptop.credential });
  await loginWithCredential({ username: secondUser.username, credential: secondUser.credential });
  await loginWithCredential({ username: secondUser.username, credential: bobPhone.credential });
  await loginWithCredential({ username: secondUser.username, credential: bobTablet.credential });
  await loginWithCredential({ username: secondUser.username, credential: bobLaptop.credential });

  assertTrustChain();
});
