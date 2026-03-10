export type CreationOptions = {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams?: Array<{ type: string; alg: number }>;
};

export type RequestOptions = {
  challenge: string;
  rpId: string;
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
};

export type AttestationResponse = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    attestationObject: string;
  };
};

export type AssertionResponse = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string;
  };
};

export type StoredCredential = {
  id: string;
  publicKey: string;
  publicKeyPem?: string;
  privateKeyPem?: string;
  rpId?: string;
  algorithm: number;
  signCount: number;
  userId: string;
  transports?: string[];
};
