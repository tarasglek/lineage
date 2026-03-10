import {
  signAuthSessionToken,
  signFlowToken,
  verifyAuthSessionToken,
  verifyFlowToken,
} from "../../src/auth/jwt.ts";

Deno.test("jwt helper signs and verifies auth session tokens", async () => {
  const token = await signAuthSessionToken({ userId: "user-1", username: "alice" });
  const payload = await verifyAuthSessionToken(token);

  if (payload.userId !== "user-1") throw new Error(`expected user-1, got ${payload.userId}`);
  if (payload.username !== "alice") throw new Error(`expected alice, got ${payload.username}`);
});

Deno.test("jwt helper signs and verifies flow tokens", async () => {
  const token = await signFlowToken({
    flowType: "register",
    challenge: "challenge-1",
    username: "alice",
    inviteToken: "invite-1",
    userId: "user-1",
  });
  const payload = await verifyFlowToken(token, "register");

  if (payload.challenge !== "challenge-1") throw new Error("missing challenge");
  if (payload.inviteToken !== "invite-1") throw new Error("missing invite token");
});

Deno.test("jwt helper rejects expired token", async () => {
  const token = await signFlowToken(
    {
      flowType: "register",
      challenge: "challenge-1",
      username: "alice",
      inviteToken: "invite-1",
      userId: "user-1",
    },
    { expiresInSeconds: -1 },
  );

  let rejected = false;
  try {
    await verifyFlowToken(token, "register");
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("expected expired token rejection");
});

Deno.test("jwt helper rejects wrong token type", async () => {
  const token = await signFlowToken({
    flowType: "login",
    challenge: "challenge-1",
    username: "alice",
    userId: "user-1",
  });

  let rejected = false;
  try {
    await verifyFlowToken(token, "register");
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("expected wrong type rejection");
});
