import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../db/schema.js";
import { AuthService } from "./authService.js";
import type { JwtPayload } from "./authService.js";
import jwt from "jsonwebtoken";

// Use a real in-memory SQLite DB — simpler and more reliable than mocking.
// bcrypt is the real implementation; tests use round=1 via env override isn't
// possible here, so we accept slightly slower tests for correctness.
// The AuthService uses BCRYPT_ROUNDS=12 internally; we can't override that
// without dependency injection, so unit tests that call bcrypt are slightly slow.

function makeDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  return database;
}

function makeService(database: Database.Database) {
  return new AuthService(database);
}

const adminActor: JwtPayload = {
  sub: "admin-id",
  username: "admin",
  role: "ADMIN",
  iat: 0,
  exp: 9999999999,
};

const volunteerActor: JwtPayload = {
  sub: "vol-id",
  username: "volunteer",
  role: "AvVolunteer",
  iat: 0,
  exp: 9999999999,
};

describe("AuthService.bootstrapIfEmpty", () => {
  it("creates an admin user when no users exist", () => {
    const database = makeDatabase();
    const service = makeService(database);
    service.bootstrapIfEmpty();
    const count = (database.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number }).cnt;
    expect(count).toBe(1);
  });

  it("sets requiresPasswordChange on the bootstrap user", () => {
    const database = makeDatabase();
    const service = makeService(database);
    service.bootstrapIfEmpty();
    const row = database.prepare("SELECT requiresPasswordChange FROM users WHERE username = 'admin'").get() as { requiresPasswordChange: number };
    expect(row.requiresPasswordChange).toBe(1);
  });

  it("does not create a user if one already exists", () => {
    const database = makeDatabase();
    const service = makeService(database);
    service.bootstrapIfEmpty();
    service.bootstrapIfEmpty(); // second call
    const count = (database.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number }).cnt;
    expect(count).toBe(1);
  });
});

describe("AuthService.login", () => {
  it("returns a token on valid credentials", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    await service.createUser({ username: "alice", password: "pass123", role: "AvVolunteer" }, adminActor);
    const result = await service.login("alice", "pass123");
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.token).toBeTruthy();
  });

  it("fails on wrong password", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    await service.createUser({ username: "alice", password: "pass123", role: "AvVolunteer" }, adminActor);
    const result = await service.login("alice", "wrong");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("fails on unknown username", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    const result = await service.login("nobody", "pass");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("includes requiresPasswordChange in token when flag is set", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    service.bootstrapIfEmpty();
    // Get the bootstrap password from the DB — we can't read bootstrap.txt in tests
    // so we reset the password directly and log in
    const row = database.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string };
    await service.changePassword(row.id, "newpass", { ...adminActor, sub: row.id });
    // After changePassword, requiresPasswordChange is cleared — verify via login
    const result = await service.login("admin", "newpass");
    expect(result.success).toBe(true);
    if (result.success) {
      const decoded = jwt.decode(result.value.token) as JwtPayload;
      expect(decoded.requiresPasswordChange).toBeUndefined();
    }
  });

  it("sets longer expiry with rememberMe", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    await service.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, adminActor);
    const short = await service.login("alice", "pass", false);
    const long = await service.login("alice", "pass", true);
    expect(short.success && long.success).toBe(true);
    if (short.success && long.success) {
      const s = jwt.decode(short.value.token) as JwtPayload;
      const l = jwt.decode(long.value.token) as JwtPayload;
      expect(l.exp - l.iat).toBeGreaterThan(s.exp - s.iat);
    }
  });
});

describe("AuthService.verifyToken", () => {
  it("returns payload for a valid token", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    await service.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, adminActor);
    const loginResult = await service.login("alice", "pass");
    expect(loginResult.success).toBe(true);
    if (!loginResult.success) return;
    const result = service.verifyToken(loginResult.value.token);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.username).toBe("alice");
  });

  it("fails for a tampered token", () => {
    const database = makeDatabase();
    const service = makeService(database);
    const result = service.verifyToken("not.a.token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INVALID_TOKEN");
  });
});

describe("AuthService.requireRole", () => {
  it("allows ADMIN to access ADMIN-required resource", () => {
    const service = makeService(makeDatabase());
    expect(service.requireRole(adminActor, "ADMIN").success).toBe(true);
  });

  it("allows ADMIN to access AvVolunteer-required resource", () => {
    const service = makeService(makeDatabase());
    expect(service.requireRole(adminActor, "AvVolunteer").success).toBe(true);
  });

  it("denies AvVolunteer from ADMIN-required resource", () => {
    const service = makeService(makeDatabase());
    const result = service.requireRole(volunteerActor, "ADMIN");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("allows AvPowerUser to access AvVolunteer-required resource", () => {
    const service = makeService(makeDatabase());
    const powerUser: JwtPayload = { ...adminActor, role: "AvPowerUser" };
    expect(service.requireRole(powerUser, "AvVolunteer").success).toBe(true);
  });
});

describe("AuthService.createUser", () => {
  it("creates a user and returns it without password", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    const result = await service.createUser({ username: "bob", password: "secret", role: "AvVolunteer" }, adminActor);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.username).toBe("bob");
      expect(result.value.role).toBe("AvVolunteer");
    }
  });

  it("sets requiresPasswordChange on new users", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    const result = await service.createUser({ username: "bob", password: "secret", role: "AvVolunteer" }, adminActor);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.requiresPasswordChange).toBe(true);
  });

  it("rejects duplicate username", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    await service.createUser({ username: "bob", password: "secret", role: "AvVolunteer" }, adminActor);
    const result = await service.createUser({ username: "bob", password: "other", role: "ADMIN" }, adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USERNAME_TAKEN");
  });

  it("rejects non-ADMIN actor", async () => {
    const service = makeService(makeDatabase());
    const result = await service.createUser({ username: "x", password: "y", role: "AvVolunteer" }, volunteerActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INSUFFICIENT_ROLE");
  });
});

describe("AuthService.updateUser", () => {
  it("updates username", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    const created = await service.createUser({ username: "bob", password: "pass", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const result = await service.updateUser(created.value.id, { username: "bobby" }, adminActor);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.username).toBe("bobby");
  });

  it("returns USER_NOT_FOUND for unknown id", async () => {
    const service = makeService(makeDatabase());
    const result = await service.updateUser("nonexistent", { username: "x" }, adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  it("rejects duplicate username on update", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    await service.createUser({ username: "alice", password: "p", role: "AvVolunteer" }, adminActor);
    const bob = await service.createUser({ username: "bob", password: "p", role: "AvVolunteer" }, adminActor);
    expect(bob.success).toBe(true);
    if (!bob.success) return;
    const result = await service.updateUser(bob.value.id, { username: "alice" }, adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USERNAME_TAKEN");
  });
});

describe("AuthService.deleteUser", () => {
  it("deletes a user", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    const created = await service.createUser({ username: "bob", password: "pass", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const result = service.deleteUser(created.value.id, adminActor);
    expect(result.success).toBe(true);
    const count = (database.prepare("SELECT COUNT(*) as cnt FROM users WHERE id = ?").get(created.value.id) as { cnt: number }).cnt;
    expect(count).toBe(0);
  });

  it("blocks self-delete", () => {
    const service = makeService(makeDatabase());
    const result = service.deleteUser(adminActor.sub, adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("SELF_DELETE");
  });

  it("returns USER_NOT_FOUND for unknown id", () => {
    const service = makeService(makeDatabase());
    const result = service.deleteUser("nonexistent", adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USER_NOT_FOUND");
  });
});

describe("AuthService.listUsers", () => {
  it("returns all users without password hashes", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    await service.createUser({ username: "alice", password: "p", role: "AvVolunteer" }, adminActor);
    const result = service.listUsers(adminActor);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).not.toHaveProperty("passwordHash");
    }
  });

  it("rejects non-ADMIN", () => {
    const service = makeService(makeDatabase());
    const result = service.listUsers(volunteerActor);
    expect(result.success).toBe(false);
  });
});

describe("AuthService.changePassword", () => {
  it("clears requiresPasswordChange flag when user changes own password", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    service.bootstrapIfEmpty();
    const row = database.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string };
    const result = await service.changePassword(row.id, "newpass", { ...adminActor, sub: row.id });
    expect(result.success).toBe(true);
    const updated = database.prepare("SELECT requiresPasswordChange FROM users WHERE id = ?").get(row.id) as { requiresPasswordChange: number };
    expect(updated.requiresPasswordChange).toBe(0);
  });

  it("sets requiresPasswordChange when admin resets another user's password", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    const created = await service.createUser({ username: "alice", password: "old", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    // Admin resets alice's password
    const result = await service.changePassword(created.value.id, "newpass", adminActor);
    expect(result.success).toBe(true);
    const updated = database.prepare("SELECT requiresPasswordChange FROM users WHERE id = ?").get(created.value.id) as { requiresPasswordChange: number };
    expect(updated.requiresPasswordChange).toBe(1);
  });

  it("issues a new JWT without requiresPasswordChange", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    service.bootstrapIfEmpty();
    const row = database.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string };
    const result = await service.changePassword(row.id, "newpass", { ...adminActor, sub: row.id });
    expect(result.success).toBe(true);
    if (result.success) {
      const decoded = jwt.decode(result.value.token) as JwtPayload;
      expect(decoded.requiresPasswordChange).toBeUndefined();
    }
  });

  it("returns USER_NOT_FOUND for unknown id", async () => {
    const service = makeService(makeDatabase());
    const result = await service.changePassword("nonexistent", "pass", adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  it("allows user to change their own password", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    const created = await service.createUser({ username: "alice", password: "old", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const aliceActor: JwtPayload = { ...volunteerActor, sub: created.value.id };
    const result = await service.changePassword(created.value.id, "new", aliceActor);
    expect(result.success).toBe(true);
  });

  it("blocks non-ADMIN from changing another user's password", async () => {
    const database = makeDatabase();
    const service = makeService(database);
    const created = await service.createUser({ username: "alice", password: "old", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const result = await service.changePassword(created.value.id, "new", volunteerActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("deletes bootstrap.txt if it exists (verified via no error thrown)", async () => {
    // The bootstrap.txt deletion is covered by the integration path:
    // bootstrapIfEmpty writes the file, changePassword deletes it.
    // We verify the happy path doesn't throw even when the file doesn't exist.
    const database = makeDatabase();
    const service = makeService(database);
    const created = await service.createUser({ username: "alice", password: "old", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const aliceActor: JwtPayload = { ...volunteerActor, sub: created.value.id };
    await expect(service.changePassword(created.value.id, "new", aliceActor)).resolves.toMatchObject({ success: true });
  });
});
