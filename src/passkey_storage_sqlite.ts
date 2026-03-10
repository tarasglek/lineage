import { DatabaseSync } from "node:sqlite";
import type {
  Credential,
  Invite,
  PasskeyStorage,
  SessionRecord,
  User,
} from "./passkey_storage.ts";

function ensureDirectoryForDb(path: string) {
  const directory = path.includes("/")
    ? path.slice(0, path.lastIndexOf("/"))
    : ".";
  if (directory && directory !== "." && directory !== path) {
    Deno.mkdirSync(directory, { recursive: true });
  }
}

export function initializePasskeyStorageSqlite(
  path: string,
): void {
  ensureDirectoryForDb(path);
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        invited_by TEXT NULL
      );

      CREATE TABLE IF NOT EXISTS invites (
        token TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        inviter_user_id TEXT NULL,
        target_user_id TEXT NULL,
        label TEXT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER NULL
      );

      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        public_key_pem TEXT NULL,
        algorithm INTEGER NOT NULL,
        sign_count INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        transports_json TEXT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  } finally {
    db.close();
  }
}

function mapUser(row: Record<string, unknown> | undefined): User | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    username: String(row.username),
    invitedBy: row.invited_by === null
      ? null
      : row.invited_by === undefined
      ? undefined
      : String(row.invited_by),
  };
}

function mapInvite(
  row: Record<string, unknown> | undefined,
): Invite | undefined {
  if (!row) return undefined;
  return {
    token: String(row.token),
    type: String(row.type) as "user" | "device",
    inviterUserId: row.inviter_user_id === null
      ? null
      : row.inviter_user_id === undefined
      ? null
      : String(row.inviter_user_id),
    targetUserId:
      row.target_user_id === null || row.target_user_id === undefined
        ? undefined
        : String(row.target_user_id),
    label: row.label === null || row.label === undefined
      ? undefined
      : String(row.label),
    expiresAt: Number(row.expires_at),
    usedAt: row.used_at === null || row.used_at === undefined
      ? null
      : Number(row.used_at),
  };
}

function mapCredential(
  row: Record<string, unknown> | undefined,
): Credential | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id),
    publicKey: String(row.public_key),
    publicKeyPem:
      row.public_key_pem === null || row.public_key_pem === undefined
        ? undefined
        : String(row.public_key_pem),
    algorithm: Number(row.algorithm),
    signCount: Number(row.sign_count),
    userId: String(row.user_id),
    transports: row.transports_json
      ? JSON.parse(String(row.transports_json))
      : undefined,
  };
}

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    userId: String(row.user_id),
    createdAt: Number(row.created_at),
  };
}

export function createSqlitePasskeyStorage(path: string): PasskeyStorage {
  ensureDirectoryForDb(path);
  const db = new DatabaseSync(path);

  return {
    getUser(userId) {
      return mapUser(
        db.prepare("SELECT id, username, invited_by FROM users WHERE id = ?")
          .get(userId) as Record<string, unknown> | undefined,
      );
    },
    findUserByUsername(username) {
      return mapUser(
        db.prepare(
          "SELECT id, username, invited_by FROM users WHERE username = ?",
        ).get(username) as Record<string, unknown> | undefined,
      );
    },
    putUser(user) {
      db.prepare(`
        INSERT INTO users (id, username, invited_by)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET username = excluded.username, invited_by = excluded.invited_by
      `).run(user.id, user.username, user.invitedBy ?? null);
    },
    listUsers() {
      return (db.prepare(
        "SELECT id, username, invited_by FROM users ORDER BY username",
      ).all() as Record<string, unknown>[]).map(mapUser).filter(
        Boolean,
      ) as User[];
    },
    getInvite(token) {
      return mapInvite(
        db.prepare(
          "SELECT token, type, inviter_user_id, target_user_id, label, expires_at, used_at FROM invites WHERE token = ?",
        ).get(token) as Record<string, unknown> | undefined,
      );
    },
    putInvite(invite) {
      db.prepare(`
        INSERT INTO invites (token, type, inviter_user_id, target_user_id, label, expires_at, used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET
          type = excluded.type,
          inviter_user_id = excluded.inviter_user_id,
          target_user_id = excluded.target_user_id,
          label = excluded.label,
          expires_at = excluded.expires_at,
          used_at = excluded.used_at
      `).run(
        invite.token,
        invite.type,
        invite.inviterUserId ?? null,
        invite.targetUserId ?? null,
        invite.label ?? null,
        invite.expiresAt,
        invite.usedAt ?? null,
      );
    },
    listInvites() {
      return (db.prepare(
        "SELECT token, type, inviter_user_id, target_user_id, label, expires_at, used_at FROM invites ORDER BY token",
      ).all() as Record<string, unknown>[]).map(mapInvite).filter(
        Boolean,
      ) as Invite[];
    },
    getCredential(id) {
      return mapCredential(
        db.prepare(
          "SELECT id, public_key, public_key_pem, algorithm, sign_count, user_id, transports_json FROM credentials WHERE id = ?",
        ).get(id) as Record<string, unknown> | undefined,
      );
    },
    putCredential(credential) {
      db.prepare(`
        INSERT INTO credentials (id, public_key, public_key_pem, algorithm, sign_count, user_id, transports_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          public_key = excluded.public_key,
          public_key_pem = excluded.public_key_pem,
          algorithm = excluded.algorithm,
          sign_count = excluded.sign_count,
          user_id = excluded.user_id,
          transports_json = excluded.transports_json
      `).run(
        credential.id,
        credential.publicKey,
        credential.publicKeyPem ?? null,
        credential.algorithm,
        credential.signCount,
        credential.userId,
        credential.transports ? JSON.stringify(credential.transports) : null,
      );
    },
    listCredentials() {
      return (db.prepare(
        "SELECT id, public_key, public_key_pem, algorithm, sign_count, user_id, transports_json FROM credentials ORDER BY id",
      ).all() as Record<string, unknown>[]).map(mapCredential).filter(
        Boolean,
      ) as Credential[];
    },
    recordSession(session) {
      db.prepare("INSERT INTO sessions (user_id, created_at) VALUES (?, ?)")
        .run(session.userId, session.createdAt);
    },
    listSessions() {
      return (db.prepare("SELECT user_id, created_at FROM sessions ORDER BY id")
        .all() as Record<string, unknown>[]).map(mapSession);
    },
    transaction(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}
