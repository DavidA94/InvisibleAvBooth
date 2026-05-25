import type { Database } from "better-sqlite3";
import type { Role, LowerThirdType } from "@invisible-av-booth/shared";
import { createId } from "@paralleldrive/cuid2";

export type TemplateCategory = "title" | "description" | "lower_third";

export interface MetadataTemplateRow {
  id: string;
  name: string;
  category: TemplateCategory;
  formatString: string;
  roleMinimum: Role;
  lowerThirdType: LowerThirdType | null;
  autoDismissMs: number | null;
  createdAt: string;
}

export interface CreateTemplateInput {
  name: string;
  category: TemplateCategory;
  formatString: string;
  roleMinimum: Role;
  lowerThirdType?: LowerThirdType;
  autoDismissMs?: number | null;
}

export interface UpdateTemplateInput {
  name?: string;
  formatString?: string;
  roleMinimum?: Role;
  lowerThirdType?: LowerThirdType;
  autoDismissMs?: number | null;
}

/**
 * Role hierarchy determines which templates a user can see.
 * ADMIN sees all, AvPowerUser sees AvPowerUser + AvVolunteer, AvVolunteer sees only AvVolunteer.
 */
const ACCESSIBLE_ROLES: Record<Role, Role[]> = {
  ADMIN: ["ADMIN", "AvPowerUser", "AvVolunteer"],
  AvPowerUser: ["AvPowerUser", "AvVolunteer"],
  AvVolunteer: ["AvVolunteer"],
};

export class MetadataTemplateDao {
  constructor(private readonly database: Database) {}

  getAll(): MetadataTemplateRow[] {
    return this.database.prepare("SELECT * FROM metadata_templates").all() as MetadataTemplateRow[];
  }

  getById(id: string): MetadataTemplateRow | null {
    return (this.database.prepare("SELECT * FROM metadata_templates WHERE id = ?").get(id) as MetadataTemplateRow) ?? null;
  }

  getByCategory(category: TemplateCategory): MetadataTemplateRow[] {
    return this.database.prepare("SELECT * FROM metadata_templates WHERE category = ?").all(category) as MetadataTemplateRow[];
  }

  getByCategoryAndRole(category: TemplateCategory, role: Role): MetadataTemplateRow[] {
    const roles = ACCESSIBLE_ROLES[role];
    const placeholders = roles.map(() => "?").join(", ");
    return this.database
      .prepare(`SELECT * FROM metadata_templates WHERE category = ? AND roleMinimum IN (${placeholders})`)
      .all(category, ...roles) as MetadataTemplateRow[];
  }

  create(input: CreateTemplateInput): MetadataTemplateRow {
    const id = createId();
    const createdAt = new Date().toISOString();
    const formatString = input.category === "lower_third" ? canonicalizeJson(input.formatString) : input.formatString;
    this.database
      .prepare(
        "INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, lowerThirdType, autoDismissMs, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, input.name, input.category, formatString, input.roleMinimum, input.lowerThirdType ?? null, input.autoDismissMs ?? null, createdAt);
    return this.getById(id)!;
  }

  update(id: string, patch: UpdateTemplateInput): MetadataTemplateRow | null {
    const existing = this.getById(id);
    if (!existing) return null;
    if (existing.name === "None") {
      throw new Error("Cannot edit the 'None' template");
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push("name = ?");
      values.push(patch.name);
    }
    if (patch.formatString !== undefined) {
      const formatString = existing.category === "lower_third" ? canonicalizeJson(patch.formatString) : patch.formatString;
      fields.push("formatString = ?");
      values.push(formatString);
    }
    if (patch.roleMinimum !== undefined) {
      fields.push("roleMinimum = ?");
      values.push(patch.roleMinimum);
    }
    if (patch.lowerThirdType !== undefined) {
      fields.push("lowerThirdType = ?");
      values.push(patch.lowerThirdType);
    }
    if (patch.autoDismissMs !== undefined) {
      fields.push("autoDismissMs = ?");
      values.push(patch.autoDismissMs);
    }
    if (fields.length === 0) return existing;

    values.push(id);
    this.database.prepare(`UPDATE metadata_templates SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getById(id)!;
  }

  delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;
    if (existing.name === "None") {
      throw new Error("Cannot delete the 'None' template");
    }
    if (existing.category === "title" && this.titleTemplateCount() <= 1) {
      throw new Error("Cannot delete the last title template");
    }
    const result = this.database.prepare("DELETE FROM metadata_templates WHERE id = ?").run(id);
    return result.changes > 0;
  }

  countByCategoryAndRole(category: TemplateCategory, role: Role): number {
    const roles = ACCESSIBLE_ROLES[role];
    const placeholders = roles.map(() => "?").join(", ");
    const row = this.database
      .prepare(`SELECT COUNT(*) as count FROM metadata_templates WHERE category = ? AND roleMinimum IN (${placeholders})`)
      .get(category, ...roles) as { count: number };
    return row.count;
  }

  titleTemplateCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) as count FROM metadata_templates WHERE category = 'title'").get() as { count: number };
    return row.count;
  }

  getLowerThirdTemplates(): MetadataTemplateRow[] {
    return this.database.prepare("SELECT * FROM metadata_templates WHERE category = 'lower_third'").all() as MetadataTemplateRow[];
  }
}

/**
 * Normalizes a JSON string to canonical form (keys sorted alphabetically, no extra whitespace).
 * Used for lower-third formatString deduplication.
 */
export function canonicalizeJson(json: string): string {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  const sorted = Object.keys(parsed).sort();
  const canonical: Record<string, unknown> = {};
  for (const key of sorted) {
    canonical[key] = parsed[key];
  }
  return JSON.stringify(canonical);
}
