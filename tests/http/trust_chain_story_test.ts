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

  async function submitRegistrationForm(_input: {
    inviteToken: string;
    username: string;
    origin?: string;
  }): Promise<StoryRegistration> {
    throw new Error("not implemented");
  }

  async function createInviteThroughForm(_input: {
    inviterUserId: string;
    type: "user" | "device";
    label: string;
    targetUserId?: string;
  }): Promise<StoryInvite> {
    throw new Error("not implemented");
  }

  async function loginWithCredential(_input: {
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
    throw new Error("not implemented");
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
