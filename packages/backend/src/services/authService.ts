import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Database } from "better-sqlite3";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..", "..");
const BOOTSTRAP_FILE = join(PACKAGE_ROOT, "data", "bootstrap.txt");

const BCRYPT_ROUNDS = 12;
const JWT_SECRET = process.env["JWT_SECRET"] ?? "dev-secret-change-in-production";
const DEFAULT_EXPIRY = "8h";
const REMEMBER_ME_EXPIRY = "30d";

export type Role = "ADMIN" | "AvPowerUser" | "AvVolunteer";

const ROLE_HIERARCHY: Record<Role, number> = {
  ADMIN: 3,
  AvPowerUser: 2,
  AvVolunteer: 1,
};

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
  iat: number;
  exp: number;
  requiresPasswordChange?: boolean;
}

export interface User {
  id: string;
  username: string;
  role: Role;
  requiresPasswordChange: boolean;
  createdAt: string;
}

export interface AuthResult {
  user: Omit<User, "createdAt">;
  requiresPasswordChange?: true;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: Role;
}

export interface UpdateUserRequest {
  username?: string;
  password?: string;
  role?: Role;
}

export type Result<T, E> = { success: true; value: T } | { success: false; error: E };

export type AuthErrorCode = "INVALID_CREDENTIALS" | "USER_NOT_FOUND" | "USERNAME_TAKEN" | "FORBIDDEN" | "SELF_DELETE" | "INVALID_TOKEN" | "INSUFFICIENT_ROLE";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// Row shape as stored in SQLite
interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  requiresPasswordChange: number;
  createdAt: string;
}

export class AuthService {
  constructor(private readonly db: Database) {}

  // Bootstrap: if no users exist, create a default admin with a random password.
  // Writes credentials to stdout and data/bootstrap.txt.
  bootstrapIfEmpty(): void {
    const count = (this.db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number }).cnt;
    if (count > 0) return;

    const password = randomBytes(12).toString("base64url").slice(0, 16);
    const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    const id = randomBytes(16).toString("hex");
    const createdAt = new Date().toISOString();

    this.db
      .prepare("INSERT INTO users (id, username, passwordHash, role, requiresPasswordChange, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, "admin", passwordHash, "ADMIN", 1, createdAt);

    const message = `Bootstrap admin created.\nUsername: admin\nPassword: ${password}\n`;
    process.stdout.write(message);

    /* c8 ignore next 3 */
    if (!existsSync(join(PACKAGE_ROOT, "data"))) {
      mkdirSync(join(PACKAGE_ROOT, "data"), { recursive: true });
    }
    writeFileSync(BOOTSTRAP_FILE, message, "utf8");

    logger.warn("Bootstrap admin created — change password immediately", { userId: id });
  }

  async login(username: string, password: string, rememberMe = false): Promise<Result<{ token: string; user: AuthResult }, AuthError>> {
    const row = this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;

    if (!row) {
      return { success: false, error: new AuthError("INVALID_CREDENTIALS", "Invalid username or password") };
    }

    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) {
      return { success: false, error: new AuthError("INVALID_CREDENTIALS", "Invalid username or password") };
    }

    const payload: Omit<JwtPayload, "iat" | "exp"> = {
      sub: row.id,
      username: row.username,
      role: row.role,
      ...(row.requiresPasswordChange ? { requiresPasswordChange: true } : {}),
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: rememberMe ? REMEMBER_ME_EXPIRY : DEFAULT_EXPIRY,
    });

    logger.info("User logged in", { userId: row.id });

    const authResult: AuthResult = {
      user: { id: row.id, username: row.username, role: row.role, requiresPasswordChange: !!row.requiresPasswordChange },
      ...(row.requiresPasswordChange ? { requiresPasswordChange: true as const } : {}),
    };

    return { success: true, value: { token, user: authResult } };
  }

  verifyToken(token: string): Result<JwtPayload, AuthError> {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      return { success: true, value: payload };
    } catch {
      return { success: false, error: new AuthError("INVALID_TOKEN", "Invalid or expired token") };
    }
  }

  requireRole(payload: JwtPayload, minimum: Role): Result<void, AuthError> {
    if ((ROLE_HIERARCHY[payload.role] ?? 0) >= (ROLE_HIERARCHY[minimum] ?? 0)) {
      return { success: true, value: undefined };
    }
    return { success: false, error: new AuthError("INSUFFICIENT_ROLE", `Requires ${minimum} role`) };
  }

  async createUser(data: CreateUserRequest, actor: JwtPayload): Promise<Result<User, AuthError>> {
    const roleCheck = this.requireRole(actor, "ADMIN");
    if (!roleCheck.success) return roleCheck;

    const existing = this.db.prepare("SELECT id FROM users WHERE username = ?").get(data.username);
    if (existing) {
      return { success: false, error: new AuthError("USERNAME_TAKEN", "Username already exists") };
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const id = randomBytes(16).toString("hex");
    const createdAt = new Date().toISOString();

    this.db
      .prepare("INSERT INTO users (id, username, passwordHash, role, requiresPasswordChange, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, data.username, passwordHash, data.role, 0, createdAt);

    logger.info("User created", { userId: actor.sub, context: { newUserId: id } });

    return { success: true, value: { id, username: data.username, role: data.role, requiresPasswordChange: false, createdAt } };
  }

  async updateUser(id: string, data: UpdateUserRequest, actor: JwtPayload): Promise<Result<User, AuthError>> {
    const roleCheck = this.requireRole(actor, "ADMIN");
    if (!roleCheck.success) return roleCheck;

    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    if (!row) {
      return { success: false, error: new AuthError("USER_NOT_FOUND", "User not found") };
    }

    if (data.username && data.username !== row.username) {
      const existing = this.db.prepare("SELECT id FROM users WHERE username = ?").get(data.username);
      if (existing) {
        return { success: false, error: new AuthError("USERNAME_TAKEN", "Username already exists") };
      }
    }

    const newUsername = data.username ?? row.username;
    const newRole = data.role ?? row.role;
    const newHash = data.password ? await bcrypt.hash(data.password, BCRYPT_ROUNDS) : row.passwordHash;

    this.db.prepare("UPDATE users SET username = ?, passwordHash = ?, role = ? WHERE id = ?").run(newUsername, newHash, newRole, id);

    logger.info("User updated", { userId: actor.sub, context: { targetUserId: id } });

    return {
      success: true,
      value: { id, username: newUsername, role: newRole, requiresPasswordChange: !!row.requiresPasswordChange, createdAt: row.createdAt },
    };
  }

  deleteUser(id: string, actor: JwtPayload): Result<void, AuthError> {
    const roleCheck = this.requireRole(actor, "ADMIN");
    if (!roleCheck.success) return roleCheck;

    if (actor.sub === id) {
      return { success: false, error: new AuthError("SELF_DELETE", "Cannot delete your own account") };
    }

    const row = this.db.prepare("SELECT id FROM users WHERE id = ?").get(id);
    if (!row) {
      return { success: false, error: new AuthError("USER_NOT_FOUND", "User not found") };
    }

    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
    logger.info("User deleted", { userId: actor.sub, context: { targetUserId: id } });

    return { success: true, value: undefined };
  }

  listUsers(actor: JwtPayload): Result<User[], AuthError> {
    const roleCheck = this.requireRole(actor, "ADMIN");
    if (!roleCheck.success) return roleCheck;

    const rows = this.db.prepare("SELECT id, username, role, requiresPasswordChange, createdAt FROM users").all() as UserRow[];
    return {
      success: true,
      value: rows.map((r) => ({
        id: r.id,
        username: r.username,
        role: r.role,
        requiresPasswordChange: !!r.requiresPasswordChange,
        createdAt: r.createdAt,
      })),
    };
  }

  async changePassword(id: string, newPassword: string, actor: JwtPayload): Promise<Result<{ token: string }, AuthError>> {
    // Users can change their own password; ADMIN can change anyone's.
    if (actor.sub !== id) {
      const roleCheck = this.requireRole(actor, "ADMIN");
      if (!roleCheck.success) return roleCheck;
    }

    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    if (!row) {
      return { success: false, error: new AuthError("USER_NOT_FOUND", "User not found") };
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    this.db.prepare("UPDATE users SET passwordHash = ?, requiresPasswordChange = 0 WHERE id = ?").run(newHash, id);

    // Delete bootstrap.txt if it exists — the bootstrap password is now invalid.
    if (existsSync(BOOTSTRAP_FILE)) {
      try {
        unlinkSync(BOOTSTRAP_FILE);
      } catch (err) {
        /* c8 ignore next -- deletion failure is logged but not fatal */
        logger.warn("Failed to delete bootstrap.txt", { userId: id, context: { error: String(err) } });
      }
    }

    const payload: Omit<JwtPayload, "iat" | "exp"> = {
      sub: row.id,
      username: row.username,
      role: row.role,
      // requiresPasswordChange intentionally omitted — flag is now cleared
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: DEFAULT_EXPIRY });
    logger.info("Password changed", { userId: id });

    return { success: true, value: { token } };
  }
}
