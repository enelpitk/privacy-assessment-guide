import type { FieldDef } from "@/content/types";

const DEFAULT_MAX: Record<string, number> = { text: 500, longtext: 20000, link: 2000 };

export function isEmptyValue(def: Pick<FieldDef, "type">, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  switch (def.type) {
    case "text":
    case "longtext":
    case "link":
    case "date":
    case "choice":
    case "yesno":
    case "entity":
      return typeof value !== "string" || value.trim() === "";
    case "multi":
    case "entities":
      return !Array.isArray(value) || value.length === 0;
    case "number":
      return typeof value !== "number";
    case "quantity": {
      const q = value as { min?: unknown };
      return typeof q !== "object" || typeof q.min !== "number";
    }
    case "flag":
      return value !== true;
    case "person": {
      const p = value as { userId?: string; text?: string };
      return !(p && (p.userId || (p.text && p.text.trim())));
    }
    default:
      return false;
  }
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Returns an error message, or null when the value is acceptable. Empty values are always acceptable. */
export function validateValue(def: FieldDef, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  switch (def.type) {
    case "computed":
      return "This value is calculated and cannot be edited.";
    case "text":
    case "longtext":
    case "link": {
      if (typeof value !== "string") return "Enter text.";
      const max = def.maxLength ?? DEFAULT_MAX[def.type];
      if (value.length > max) return `Keep this under ${max} characters.`;
      if (def.type === "link" && /^https?:\/\//i.test(value.trim())) {
        try {
          new URL(value.trim());
        } catch {
          return "That link does not look like a valid web address.";
        }
      }
      return null;
    }
    case "date":
      if (typeof value !== "string") return "Enter a date.";
      if (value === "") return null;
      return validDate(value) ? null : "Enter a valid date (YYYY-MM-DD).";
    case "number":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000
        ? null
        : "Enter a whole number, zero or more.";
    case "quantity": {
      const q = value as { min?: unknown; max?: unknown };
      if (typeof value !== "object" || value === null) return "Enter a number or a range.";
      const ok = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1_000_000_000;
      if (!ok(q.min) || !ok(q.max)) return "Enter whole numbers, zero or more.";
      if ((q.min as number) > (q.max as number)) return "The lower figure must not be higher than the upper figure.";
      return null;
    }
    case "choice": {
      if (typeof value !== "string") return "Choose one option.";
      if (value === "") return null;
      return def.options?.some((o) => o.value === value) ? null : "That is not one of the available options.";
    }
    case "multi": {
      if (!Array.isArray(value)) return "Choose from the options.";
      const allowed = new Set(def.options?.map((o) => o.value));
      if (new Set(value).size !== value.length) return "Duplicate choices.";
      return value.every((v) => typeof v === "string" && allowed.has(v)) ? null : "That is not one of the available options.";
    }
    case "yesno":
      return value === "" || value === "YES" || value === "NO" ? null : "Choose Yes or No.";
    case "flag":
      return typeof value === "boolean" ? null : "Invalid selection.";
    case "entity":
      return typeof value === "string" && value.length <= 64 ? null : "Choose an entry.";
    case "entities":
      return Array.isArray(value) && value.length <= 200 && value.every((v) => typeof v === "string" && v.length <= 64)
        ? null
        : "Choose entries.";
    case "person": {
      const p = value as { userId?: unknown; text?: unknown };
      if (typeof value !== "object" || value === null) return "Choose a person or enter a role.";
      const hasUser = typeof p.userId === "string" && p.userId !== "";
      const hasText = typeof p.text === "string" && p.text.trim() !== "";
      if (hasUser === hasText) return "Choose a demo user, or enter a role or person as free text, not both.";
      if (hasText && (p.text as string).length > 200) return "Keep this under 200 characters.";
      return null;
    }
    default:
      return null;
  }
}
