import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as fc from "fast-check";
import { applySchema } from "../database/schema.js";
import { MetadataTemplateDao } from "./metadataTemplateDao.js";
import type { CreateTemplateInput, TemplateCategory } from "./metadataTemplateDao.js";
import type { Role } from "@invisible-av-booth/shared";

function makeDatabase(): Database.Database {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  return database;
}

function makeDao(database?: Database.Database): MetadataTemplateDao {
  return new MetadataTemplateDao(database ?? makeDatabase());
}

const TITLE_INPUT: CreateTemplateInput = {
  name: "Default",
  category: "title",
  formatString: "{Date} – {Speaker}",
  roleMinimum: "AvVolunteer",
};

const DESC_INPUT: CreateTemplateInput = {
  name: "Sermon Desc",
  category: "description",
  formatString: "Sermon by {Speaker}",
  roleMinimum: "AvVolunteer",
};

describe("MetadataTemplateDao", () => {
  let database: Database.Database;
  let dao: MetadataTemplateDao;

  beforeEach(() => {
    database = makeDatabase();
    dao = makeDao(database);
  });

  describe("create", () => {
    it("creates a template and returns it with an id and createdAt", () => {
      const result = dao.create(TITLE_INPUT);
      expect(result.id).toBeDefined();
      expect(result.name).toBe(TITLE_INPUT.name);
      expect(result.category).toBe("title");
      expect(result.formatString).toBe(TITLE_INPUT.formatString);
      expect(result.roleMinimum).toBe("AvVolunteer");
      expect(result.createdAt).toBeDefined();
    });
  });

  describe("getAll", () => {
    it("returns empty array when no templates exist", () => {
      expect(dao.getAll()).toEqual([]);
    });

    it("returns all created templates", () => {
      dao.create(TITLE_INPUT);
      dao.create(DESC_INPUT);
      expect(dao.getAll()).toHaveLength(2);
    });
  });

  describe("getById", () => {
    it("returns null for non-existent id", () => {
      expect(dao.getById("nonexistent")).toBeNull();
    });

    it("returns the correct template", () => {
      const created = dao.create(TITLE_INPUT);
      const found = dao.getById(created.id);
      expect(found).toEqual(created);
    });
  });

  describe("getByCategory", () => {
    it("returns only templates in the given category", () => {
      dao.create(TITLE_INPUT);
      dao.create(DESC_INPUT);
      const titles = dao.getByCategory("title");
      expect(titles).toHaveLength(1);
      expect(titles[0]!.category).toBe("title");
    });
  });

  describe("getByCategoryAndRole", () => {
    function seedAllRoles(category: TemplateCategory): void {
      dao.create({ ...TITLE_INPUT, category, name: "Admin Only", roleMinimum: "ADMIN" });
      dao.create({ ...TITLE_INPUT, category, name: "Power User", roleMinimum: "AvPowerUser" });
      dao.create({ ...TITLE_INPUT, category, name: "Volunteer", roleMinimum: "AvVolunteer" });
    }

    it("ADMIN sees all three roleMinimum levels", () => {
      seedAllRoles("title");
      const results = dao.getByCategoryAndRole("title", "ADMIN");
      expect(results).toHaveLength(3);
    });

    it("AvPowerUser sees AvPowerUser and AvVolunteer templates", () => {
      seedAllRoles("title");
      const results = dao.getByCategoryAndRole("title", "AvPowerUser");
      expect(results).toHaveLength(2);
      const roles = results.map((r) => r.roleMinimum);
      expect(roles).toContain("AvPowerUser");
      expect(roles).toContain("AvVolunteer");
      expect(roles).not.toContain("ADMIN");
    });

    it("AvVolunteer sees only AvVolunteer templates", () => {
      seedAllRoles("title");
      const results = dao.getByCategoryAndRole("title", "AvVolunteer");
      expect(results).toHaveLength(1);
      expect(results[0]!.roleMinimum).toBe("AvVolunteer");
    });

    it("filters by category as well as role", () => {
      seedAllRoles("title");
      seedAllRoles("description");
      const results = dao.getByCategoryAndRole("description", "ADMIN");
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.category === "description")).toBe(true);
    });
  });

  describe("update", () => {
    it("returns null for non-existent id", () => {
      expect(dao.update("nonexistent", { name: "New" })).toBeNull();
    });

    it("updates name", () => {
      const created = dao.create(TITLE_INPUT);
      const updated = dao.update(created.id, { name: "Renamed" });
      expect(updated!.name).toBe("Renamed");
      expect(updated!.formatString).toBe(TITLE_INPUT.formatString);
    });

    it("updates formatString", () => {
      const created = dao.create(TITLE_INPUT);
      const updated = dao.update(created.id, { formatString: "{Title}" });
      expect(updated!.formatString).toBe("{Title}");
    });

    it("updates roleMinimum", () => {
      const created = dao.create(TITLE_INPUT);
      const updated = dao.update(created.id, { roleMinimum: "ADMIN" });
      expect(updated!.roleMinimum).toBe("ADMIN");
    });

    it("returns existing template when patch is empty", () => {
      const created = dao.create(TITLE_INPUT);
      const updated = dao.update(created.id, {});
      expect(updated).toEqual(created);
    });

    it("rejects editing the 'None' template", () => {
      const none = dao.create({ ...DESC_INPUT, name: "None" });
      expect(() => dao.update(none.id, { formatString: "changed" })).toThrow("Cannot edit the 'None' template");
    });
  });

  describe("delete", () => {
    it("returns false for non-existent id", () => {
      expect(dao.delete("nonexistent")).toBe(false);
    });

    it("deletes an existing template", () => {
      const created = dao.create(DESC_INPUT);
      expect(dao.delete(created.id)).toBe(true);
      expect(dao.getById(created.id)).toBeNull();
    });

    it("rejects deletion of the 'None' template", () => {
      const none = dao.create({ ...DESC_INPUT, name: "None" });
      expect(() => dao.delete(none.id)).toThrow("Cannot delete the 'None' template");
    });

    it("rejects deletion of the last title template", () => {
      const title = dao.create(TITLE_INPUT);
      expect(() => dao.delete(title.id)).toThrow("Cannot delete the last title template");
    });

    it("allows deletion of a title template when others exist", () => {
      const first = dao.create(TITLE_INPUT);
      dao.create({ ...TITLE_INPUT, name: "Second Title" });
      expect(dao.delete(first.id)).toBe(true);
    });
  });

  describe("countByCategoryAndRole", () => {
    it("returns 0 when no templates exist", () => {
      expect(dao.countByCategoryAndRole("title", "ADMIN")).toBe(0);
    });

    it("counts only accessible templates", () => {
      dao.create({ ...TITLE_INPUT, roleMinimum: "ADMIN" });
      dao.create({ ...TITLE_INPUT, name: "Vol", roleMinimum: "AvVolunteer" });
      expect(dao.countByCategoryAndRole("title", "AvVolunteer")).toBe(1);
      expect(dao.countByCategoryAndRole("title", "ADMIN")).toBe(2);
    });
  });

  describe("titleTemplateCount", () => {
    it("returns 0 when no title templates exist", () => {
      expect(dao.titleTemplateCount()).toBe(0);
    });

    it("counts only title templates", () => {
      dao.create(TITLE_INPUT);
      dao.create(DESC_INPUT);
      expect(dao.titleTemplateCount()).toBe(1);
    });
  });

  describe("P25: role visibility filtering", () => {
    const ROLES: Role[] = ["ADMIN", "AvPowerUser", "AvVolunteer"];

    // Role hierarchy: higher roles see everything lower roles see, plus their own level.
    const ACCESSIBLE: Record<Role, Role[]> = {
      ADMIN: ["ADMIN", "AvPowerUser", "AvVolunteer"],
      AvPowerUser: ["AvPowerUser", "AvVolunteer"],
      AvVolunteer: ["AvVolunteer"],
    };

    const roleArb = fc.constantFrom<Role>("ADMIN", "AvPowerUser", "AvVolunteer");
    const categoryArb = fc.constantFrom<TemplateCategory>("title", "description");

    it("a template with roleMinimum R is visible to querying role Q iff R is in Q's accessible set", () => {
      fc.assert(
        fc.property(roleArb, roleArb, categoryArb, (templateRole, queryRole, category) => {
          const localDao = makeDao();
          localDao.create({ name: "Test", category, formatString: "fmt", roleMinimum: templateRole });
          const results = localDao.getByCategoryAndRole(category, queryRole);
          const shouldBeVisible = ACCESSIBLE[queryRole].includes(templateRole);
          if (shouldBeVisible) {
            expect(results).toHaveLength(1);
          } else {
            expect(results).toHaveLength(0);
          }
        }),
        { numRuns: 50 },
      );
    });

    it("countByCategoryAndRole matches getByCategoryAndRole length", () => {
      fc.assert(
        fc.property(roleArb, categoryArb, (queryRole, category) => {
          const localDao = makeDao();
          for (const role of ROLES) {
            localDao.create({ name: `T-${role}`, category, formatString: "fmt", roleMinimum: role });
          }
          const count = localDao.countByCategoryAndRole(category, queryRole);
          const results = localDao.getByCategoryAndRole(category, queryRole);
          expect(count).toBe(results.length);
        }),
        { numRuns: 30 },
      );
    });
  });
});

// ── Lower-Third Template Tests ────────────────────────────────────────────────

describe("MetadataTemplateDao — lower-third support", () => {
  let database: Database.Database;
  let dao: MetadataTemplateDao;

  beforeEach(() => {
    database = makeDatabase();
    dao = makeDao(database);
  });

  it("creates a lower-third template with lowerThirdType and autoDismissMs", () => {
    const row = dao.create({
      name: "Speaker Name",
      category: "lower_third",
      formatString: '{"title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
      autoDismissMs: 5000,
    });
    expect(row.category).toBe("lower_third");
    expect(row.lowerThirdType).toBe("Title");
    expect(row.autoDismissMs).toBe(5000);
  });

  it("stores formatString in canonical JSON form (keys sorted)", () => {
    const row = dao.create({
      name: "Speaker+Title",
      category: "lower_third",
      formatString: '{"subtitle":"{Title}","title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "TitleSubtitle",
    });
    // Keys should be sorted: subtitle before title
    expect(row.formatString).toBe('{"subtitle":"{Title}","title":"{Speaker}"}');

    // Even if input has different key order, output is canonical
    const row2 = dao.create({
      name: "Speaker+Title2",
      category: "lower_third",
      formatString: '{"title":"{Speaker}","subtitle":"{Title}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "TitleSubtitle",
    });
    expect(row2.formatString).toBe('{"subtitle":"{Title}","title":"{Speaker}"}');
  });

  it("allows null autoDismissMs for templates without auto-dismiss", () => {
    const row = dao.create({
      name: "Main Scripture",
      category: "lower_third",
      formatString: '{"title":"{Scripture}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Scripture",
    });
    expect(row.autoDismissMs).toBeNull();
  });

  it("getLowerThirdTemplates returns only lower_third category", () => {
    dao.create({ name: "Title", category: "title", formatString: "{Speaker}", roleMinimum: "AvVolunteer" });
    dao.create({
      name: "LT Speaker",
      category: "lower_third",
      formatString: '{"title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
    });
    const results = dao.getLowerThirdTemplates();
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("LT Speaker");
  });

  it("update handles lowerThirdType and autoDismissMs", () => {
    const row = dao.create({
      name: "Speaker",
      category: "lower_third",
      formatString: '{"title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
      autoDismissMs: 5000,
    });
    const updated = dao.update(row.id, { autoDismissMs: 10000, lowerThirdType: "Title" });
    expect(updated!.autoDismissMs).toBe(10000);
  });

  it("update canonicalizes formatString for lower_third", () => {
    const row = dao.create({
      name: "Test",
      category: "lower_third",
      formatString: '{"title":"x"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
    });
    const updated = dao.update(row.id, { formatString: '{"subtitle":"y","title":"x"}' });
    expect(updated!.formatString).toBe('{"subtitle":"y","title":"x"}');
  });

  it("existing title/description templates are unaffected by lower-third changes", () => {
    const title = dao.create({ name: "Standard", category: "title", formatString: "{Date} – {Speaker}", roleMinimum: "AvVolunteer" });
    expect(title.lowerThirdType).toBeNull();
    expect(title.autoDismissMs).toBeNull();
    expect(title.formatString).toBe("{Date} – {Speaker}"); // not canonicalized as JSON
  });
});
