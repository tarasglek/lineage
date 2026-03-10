import { SignJWT, jwtVerify, errors } from "jose";

const secret = new TextEncoder().encode(Deno.env.get("JWT_SECRET") ?? "test-jwt-secret");
const issuer = "devices";
const audience = "devices-app";

export type AuthSessionPayload = {
  type: "auth-session";
  userId: string;
  username: string;
};

export type FlowPayload = {
  type: "register-flow" | "login-flow";
  challenge: string;
  username: string;
  userId: string;
  inviteToken?: string;
};

export async function signAuthSessionToken(
  input: { userId: string; username: string },
  options?: { expiresInSeconds?: number },
) {
  return await new SignJWT({
    type: "auth-session",
    userId: input.userId,
    username: input.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(`${options?.expiresInSeconds ?? 60 * 60}s`)
    .sign(secret);
}

export async function verifyAuthSessionToken(token: string): Promise<AuthSessionPayload> {
  const { payload } = await jwtVerify(token, secret, { issuer, audience, algorithms: ["HS256"] });
  if (payload.type !== "auth-session") throw new Error("wrong_token_type");
  return {
    type: "auth-session",
    userId: String(payload.userId ?? ""),
    username: String(payload.username ?? ""),
  };
}

export async function signFlowToken(
  input: {
    flowType: "register" | "login";
    challenge: string;
    username: string;
    userId: string;
    inviteToken?: string;
  },
  options?: { expiresInSeconds?: number },
) {
  return await new SignJWT({
    type: input.flowType === "register" ? "register-flow" : "login-flow",
    challenge: input.challenge,
    username: input.username,
    userId: input.userId,
    inviteToken: input.inviteToken,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(`${options?.expiresInSeconds ?? 5 * 60}s`)
    .sign(secret);
}

export async function verifyFlowToken(token: string, expectedFlowType: "register" | "login"): Promise<FlowPayload> {
  const { payload } = await jwtVerify(token, secret, { issuer, audience, algorithms: ["HS256"] });
  const expectedType = expectedFlowType === "register" ? "register-flow" : "login-flow";
  if (payload.type !== expectedType) throw new Error("wrong_token_type");
  return {
    type: expectedType,
    challenge: String(payload.challenge ?? ""),
    username: String(payload.username ?? ""),
    userId: String(payload.userId ?? ""),
    inviteToken: payload.inviteToken ? String(payload.inviteToken) : undefined,
  };
}

export function isJwtExpiredError(error: unknown) {
  return error instanceof errors.JWTExpired;
}
