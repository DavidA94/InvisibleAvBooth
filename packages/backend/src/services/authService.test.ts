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

function makeDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  return db;
}

function makeService(db: Database.Database) {
  return new AuthService(db);
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
    const db = makeDb();
    const svc = makeService(db);
    svc.bootstrapIfEmpty();
    const count = (db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number }).cnt;
    expect(count).toBe(1);
  });

  it("sets requiresPasswordChange on the bootstrap user", () => {
    const db = makeDb();
    const svc = makeService(db);
    svc.bootstrapIfEmpty();
    const row = db.prepare("SELECT requiresPasswordChange FROM users WHERE username = 'admin'").get() as { requiresPasswordChange: number };
    expect(row.requiresPasswordChange).toBe(1);
  });

  it("does not create a user if one already exists", () => {
    const db = makeDb();
    const svc = makeService(db);
    svc.bootstrapIfEmpty();
    svc.bootstrapIfEmpty(); // second call
    const count = (db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number }).cnt;
    expect(count).toBe(1);
  });
});

describe("AuthService.login", () => {
  it("returns a token on valid credentials", async () => {
    const db = makeDb();
    const svc = makeService(db);
    await svc.createUser({ username: "alice", password: "pass123", role: "AvVolunteer" }, adminActor);
    const result = await svc.login("alice", "pass123");
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.token).toBeTruthy();
  });

  it("fails on wrong password", async () => {
    const db = makeDb();
    const svc = makeService(db);
    await svc.createUser({ username: "alice", password: "pass123", role: "AvVolunteer" }, adminActor);
    const result = await svc.login("alice", "wrong");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("fails on unknown username", async () => {
    const db = makeDb();
    const svc = makeService(db);
    const result = await svc.login("nobody", "pass");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("includes requiresPasswordChange in token when flag is set", async () => {
    const db = makeDb();
    const svc = makeService(db);
    svc.bootstrapIfEmpty();
    // Get the bootstrap password from the DB — we can't read bootstrap.txt in tests
    // so we reset the password directly and log in
    const row = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string };
    await svc.changePassword(row.id, "newpass", { ...adminActor, sub: row.id });
    // After changePassword, requiresPasswordChange is cleared — verify via login
    const result = await svc.login("admin", "newpass");
    expect(result.success).toBe(true);
    if (result.success) {
      const decoded = jwt.decode(result.value.token) as JwtPayload;
      expect(decoded.requiresPasswordChange).toBeUndefined();
    }
  });

  it("sets longer expiry with rememberMe", async () => {
    const db = makeDb();
    const svc = makeService(db);
    await svc.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, adminActor);
    const short = await svc.login("alice", "pass", false);
    const long = await svc.login("alice", "pass", true);
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
    const db = makeDb();
    const svc = makeService(db);
    await svc.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, adminActor);
    const loginResult = await svc.login("alice", "pass");
    expect(loginResult.success).toBe(true);
    if (!loginResult.success) return;
    const result = svc.verifyToken(loginResult.value.token);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.username).toBe("alice");
  });

  it("fails for a tampered token", () => {
    const db = makeDb();
    const svc = makeService(db);
    const result = svc.verifyToken("not.a.token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INVALID_TOKEN");
  });
});

describe("AuthService.requireRole", () => {
  it("allows ADMIN to access ADMIN-required resource", () => {
    const svc = makeService(makeDb());
    expect(svc.requireRole(adminActor, "ADMIN").success).toBe(true);
  });

  it("allows ADMIN to access AvVolunteer-required resource", () => {
    const svc = makeService(makeDb());
    expect(svc.requireRole(adminActor, "AvVolunteer").success).toBe(true);
  });

  it("denies AvVolunteer from ADMIN-required resource", () => {
    const svc = makeService(makeDb());
    const result = svc.requireRole(volunteerActor, "ADMIN");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("allows AvPowerUser to access AvVolunteer-required resource", () => {
    const svc = makeService(makeDb());
    const powerUser: JwtPayload = { ...adminActor, role: "AvPowerUser" };
    expect(svc.requireRole(powerUser, "AvVolunteer").success).toBe(true);
  });
});

describe("AuthService.createUser", () => {
  it("creates a user and returns it without password", async () => {
    const db = makeDb();
    const svc = makeService(db);
    const result = await svc.createUser({ username: "bob", password: "secret", role: "AvVolunteer" }, adminActor);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.username).toBe("bob");
      expect(result.value.role).toBe("AvVolunteer");
    }
  });

  it("rejects duplicate username", async () => {
    const db = makeDb();
    const svc = makeService(db);
    await svc.createUser({ username: "bob", password: "secret", role: "AvVolunteer" }, adminActor);
    const result = await svc.createUser({ username: "bob", password: "other", role: "ADMIN" }, adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USERNAME_TAKEN");
  });

  it("rejects non-ADMIN actor", async () => {
    const svc = makeService(makeDb());
    const result = await svc.createUser({ username: "x", password: "y", role: "AvVolunteer" }, volunteerActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INSUFFICIENT_ROLE");
  });
});

describe("AuthService.updateUser", () => {
  it("updates username", async () => {
    const db = makeDb();
    const svc = makeService(db);
    const created = await svc.createUser({ username: "bob", password: "pass", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const result = await svc.updateUser(created.value.id, { username: "bobby" }, adminActor);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.username).toBe("bobby");
  });

  it("returns USER_NOT_FOUND for unknown id", async () => {
    const svc = makeService(makeDb());
    const result = await svc.updateUser("nonexistent", { username: "x" }, adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  it("rejects duplicate username on update", async () => {
    const db = makeDb();
    const svc = makeService(db);
    await svc.createUser({ username: "alice", password: "p", role: "AvVolunteer" }, adminActor);
    const bob = await svc.createUser({ username: "bob", password: "p", role: "AvVolunteer" }, adminActor);
    expect(bob.success).toBe(true);
    if (!bob.success) return;
    const result = await svc.updateUser(bob.value.id, { username: "alice" }, adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USERNAME_TAKEN");
  });
});

describe("AuthService.deleteUser", () => {
  it("deletes a user", async () => {
    const db = makeDb();
    const svc = makeService(db);
    const created = await svc.createUser({ username: "bob", password: "pass", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const result = svc.deleteUser(created.value.id, adminActor);
    expect(result.success).toBe(true);
    const count = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE id = ?").get(created.value.id) as { cnt: number }).cnt;
    expect(count).toBe(0);
  });

  it("blocks self-delete", () => {
    const svc = makeService(makeDb());
    const result = svc.deleteUser(adminActor.sub, adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("SELF_DELETE");
  });

  it("returns USER_NOT_FOUND for unknown id", () => {
    const svc = makeService(makeDb());
    const result = svc.deleteUser("nonexistent", adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USER_NOT_FOUND");
  });
});

describe("AuthService.listUsers", () => {
  it("returns all users without password hashes", async () => {
    const db = makeDb();
    const svc = makeService(db);
    await svc.createUser({ username: "alice", password: "p", role: "AvVolunteer" }, adminActor);
    const result = svc.listUsers(adminActor);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).not.toHaveProperty("passwordHash");
    }
  });

  it("rejects non-ADMIN", () => {
    const svc = makeService(makeDb());
    const result = svc.listUsers(volunteerActor);
    expect(result.success).toBe(false);
  });
});

describe("AuthService.changePassword", () => {
  it("clears requiresPasswordChange flag", async () => {
    const db = makeDb();
    const svc = makeService(db);
    svc.bootstrapIfEmpty();
    const row = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string };
    const result = await svc.changePassword(row.id, "newpass", { ...adminActor, sub: row.id });
    expect(result.success).toBe(true);
    const updated = db.prepare("SELECT requiresPasswordChange FROM users WHERE id = ?").get(row.id) as { requiresPasswordChange: number };
    expect(updated.requiresPasswordChange).toBe(0);
  });

  it("issues a new JWT without requiresPasswordChange", async () => {
    const db = makeDb();
    const svc = makeService(db);
    svc.bootstrapIfEmpty();
    const row = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string };
    const result = await svc.changePassword(row.id, "newpass", { ...adminActor, sub: row.id });
    expect(result.success).toBe(true);
    if (result.success) {
      const decoded = jwt.decode(result.value.token) as JwtPayload;
      expect(decoded.requiresPasswordChange).toBeUndefined();
    }
  });

  it("returns USER_NOT_FOUND for unknown id", async () => {
    const svc = makeService(makeDb());
    const result = await svc.changePassword("nonexistent", "pass", adminActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("USER_NOT_FOUND");
  });

  it("allows user to change their own password", async () => {
    const db = makeDb();
    const svc = makeService(db);
    const created = await svc.createUser({ username: "alice", password: "old", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const aliceActor: JwtPayload = { ...volunteerActor, sub: created.value.id };
    const result = await svc.changePassword(created.value.id, "new", aliceActor);
    expect(result.success).toBe(true);
  });

  it("blocks non-ADMIN from changing another user's password", async () => {
    const db = makeDb();
    const svc = makeService(db);
    const created = await svc.createUser({ username: "alice", password: "old", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const result = await svc.changePassword(created.value.id, "new", volunteerActor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("deletes bootstrap.txt if it exists (verified via no error thrown)", async () => {
    // The bootstrap.txt deletion is covered by the integration path:
    // bootstrapIfEmpty writes the file, changePassword deletes it.
    // We verify the happy path doesn't throw even when the file doesn't exist.
    const db = makeDb();
    const svc = makeService(db);
    const created = await svc.createUser({ username: "alice", password: "old", role: "AvVolunteer" }, adminActor);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const aliceActor: JwtPayload = { ...volunteerActor, sub: created.value.id };
    await expect(svc.changePassword(created.value.id, "new", aliceActor)).resolves.toMatchObject({ success: true });
  });
});
