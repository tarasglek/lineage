export type Invite = {
  token: string;
  type: "user" | "device";
  inviterUserId: string | null;
  targetUserId?: string;
  label?: string;
  expiresAt: number;
  usedAt: number | null;
};

export type User = {
  id: string;
  username: string;
  invitedBy?: string | null;
};

export type Credential = {
  id: string;
  publicKey: string;
  publicKeyPem?: string;
  algorithm: number;
  signCount: number;
  userId: string;
  transports?: string[];
};

export type SessionRecord = { userId: string; createdAt: number };

export type TestState = {
  providerRootUserId?: string;
  invites: Map<string, Invite>;
  users: Map<string, User>;
  credentials: Map<string, Credential>;
  sessions: SessionRecord[];
};

export interface PasskeyStorage {
  getUser(userId: string): User | undefined;
  findUserByUsername(username: string): User | undefined;
  putUser(user: User): void;
  listUsers(): User[];

  getInvite(token: string): Invite | undefined;
  putInvite(invite: Invite): void;
  listInvites(): Invite[];

  getCredential(id: string): Credential | undefined;
  putCredential(credential: Credential): void;
  listCredentials(): Credential[];

  recordSession(session: SessionRecord): void;
  listSessions(): SessionRecord[];
  close(): void;
}

export function createInMemoryPasskeyStorage(state: TestState): PasskeyStorage {
  return {
    getUser(userId) {
      return state.users.get(userId);
    },
    findUserByUsername(username) {
      return Array.from(state.users.values()).find((candidate) => candidate.username === username);
    },
    putUser(user) {
      state.users.set(user.id, user);
    },
    listUsers() {
      return Array.from(state.users.values());
    },
    getInvite(token) {
      return state.invites.get(token);
    },
    putInvite(invite) {
      state.invites.set(invite.token, invite);
    },
    listInvites() {
      return Array.from(state.invites.values());
    },
    getCredential(id) {
      return state.credentials.get(id);
    },
    putCredential(credential) {
      state.credentials.set(credential.id, credential);
    },
    listCredentials() {
      return Array.from(state.credentials.values());
    },
    recordSession(session) {
      state.sessions.push(session);
    },
    listSessions() {
      return [...state.sessions];
    },
    close() {
      // no-op
    },
  };
}
