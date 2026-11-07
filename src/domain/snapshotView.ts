// Read-only presentation of a stored snapshot: only answers that were applicable then, grouped by section. Pure.
import { SUBSECTIONS, isInputField, subsectionLabel, type FieldDef } from "@/content";
import { buildModel, isItemActive, isSubsectionActive, recordsFor } from "./model";
import type { SnapshotPayload } from "./snapshot";
import { isEmptyValue } from "./validation";

export interface ViewRow {
  label: string;
  text: string;
  state: string;
  note: string | null;
}

export interface ViewSection {
  id: string;
  label: string;
  title: string;
  rows: ViewRow[];
}

const STATE_TEXT: Record<string, string> = {
  ANSWERED: "",
  UNANSWERED: "Not answered",
  NOT_APPLICABLE: "Not applicable",
  NOT_SURE: "Not sure — unresolved",
  COMPLETE_LATER: "Complete later — unresolved",
};

export function formatValue(def: FieldDef, value: unknown, p: SnapshotPayload, people: Map<string, string>): string {
  if (isEmptyValue(def, value)) return "";
  switch (def.type) {
    case "yesno":
      return value === "YES" ? "Yes" : "No";
    case "choice":
      return def.options?.find((o) => o.value === value)?.label ?? String(value);
    case "multi":
      return (value as string[]).map((v) => def.options?.find((o) => o.value === v)?.label ?? v).join("; ");
    case "flag":
      return "Yes";
    case "quantity": {
      const q = value as { min: number; max: number };
      return q.min === q.max ? String(q.min) : `${q.min} to ${q.max}`;
    }
    case "entity":
      return p.entities.find((e) => e.id === value)?.name ?? "(removed entry)";
    case "entities":
      return (value as string[]).map((id) => p.entities.find((e) => e.id === id)?.name ?? "(removed entry)").join("; ");
    case "person": {
      const v = value as { userId?: string; text?: string };
      return v.userId ? (people.get(v.userId) ?? "(unknown user)") : (v.text ?? "");
    }
    default:
      return String(value);
  }
}

/** Active (applicable) answers of the snapshot, in questionnaire order. Inactive answers are not shown as findings. */
export function viewSnapshot(p: SnapshotPayload, people: Map<string, string>): ViewSection[] {
  const model = buildModel(p.responses, p.records, p.path);
  const out: ViewSection[] = [];
  const respOf = (fid: string, rid: string) => p.responses.find((r) => r.fieldId === fid && r.recordId === rid);

  for (const sub of SUBSECTIONS) {
    if (!isSubsectionActive(sub, model.ctx)) continue;
    const rows: ViewRow[] = [];
    const walk = (items: typeof sub.items, recordId: string, prefix: string) => {
      for (const it of items) {
        if (it.kind === "info") continue;
        if (!isItemActive(it, model.ctx, recordId)) continue;
        if (it.kind === "field") {
          if (it.hidden || it.type === "computed" || it.workflow || !isInputField(it)) continue;
          const r = respOf(it.id, recordId);
          if (!r && it.optional) continue;
          rows.push({
            label: `${prefix}${it.label}`,
            text: r ? formatValue(it, r.value, p, people) : "",
            state: r ? (STATE_TEXT[r.state] ?? r.state) : "Not answered",
            note: r?.rationale ?? null,
          });
        } else {
          if (it.workflow) continue;
          const recs = recordsFor(p.records, it.id, recordId === "" ? null : recordId);
          recs.forEach((rec, i) => walk(it.items, rec.id, `${prefix}${it.itemLabel} ${i + 1} – `));
        }
      }
    };
    walk(sub.items, "", "");
    if (rows.length) out.push({ id: sub.id, label: subsectionLabel(sub.id), title: sub.title, rows });
  }
  return out;
}
