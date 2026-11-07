// Pure assessment model: evaluation context, activity and completeness.
import {
  SUBSECTIONS,
  STAGES,
  type CollectionDef,
  type FieldDef,
  type Item,
  type SubsectionDef,
} from "@/content";
import { evaluate, type AnswerState, type EvalCtx, type Resp } from "./conditions";
import { isEmptyValue } from "./validation";
import { inactiveForPath } from "./workflow";

export interface RespRow {
  fieldId: string;
  recordId: string;
  value: unknown;
  state: AnswerState;
  rationale?: string | null;
}

export interface RecordRow {
  id: string;
  collection: string;
  parentId?: string | null;
  ordering: number;
}

export interface ModelData {
  ctx: EvalCtx;
  records: RecordRow[];
}

export function buildModel(
  responses: RespRow[],
  liveRecords: RecordRow[],
  path: "OPEN" | "FULL" | "PRE_ONLY" = "OPEN",
): ModelData {
  const live = new Map(liveRecords.map((r) => [r.id, r]));
  const byKey = new Map<string, Resp>();
  const byField = new Map<string, Resp[]>();
  for (const r of responses) {
    if (r.recordId !== "" && !live.has(r.recordId)) continue; // deleted records are not live
    const resp: Resp = { value: r.value, state: r.state, rationale: r.rationale };
    byKey.set(`${r.fieldId}|${r.recordId}`, resp);
    if (r.recordId !== "") {
      const list = byField.get(r.fieldId) ?? [];
      list.push(resp);
      byField.set(r.fieldId, list);
    }
  }
  const ctx: EvalCtx = {
    get: (f, rec) => byKey.get(`${f}|${rec}`),
    anyRecord: (f) => byField.get(f) ?? [],
    recordsOf: (c) => liveRecords.filter((r) => r.collection === c).map((r) => r.id),
    parentOf: (id) => live.get(id)?.parentId ?? undefined,
    path,
  };
  return { ctx, records: liveRecords };
}

export function recordsFor(
  records: RecordRow[],
  collection: string,
  parentId: string | null,
): RecordRow[] {
  return records
    .filter((r) => r.collection === collection && (r.parentId ?? null) === parentId)
    .sort((a, b) => a.ordering - b.ordering);
}

export function isSubsectionActive(sub: SubsectionDef, ctx: EvalCtx): boolean {
  if (inactiveForPath(sub.id, sub.stage, ctx.path ?? "OPEN")) return false; // answers are kept, just not applicable
  return sub.activeWhen ? evaluate(sub.activeWhen, ctx) : true;
}

export function isItemActive(item: Item, ctx: EvalCtx, recordId: string): boolean {
  if (item.kind === "info") return item.activeWhen ? evaluate(item.activeWhen, ctx, recordId) : true;
  return item.activeWhen ? evaluate(item.activeWhen, ctx, recordId) : true;
}

export type FieldStatus =
  | "COMPLETE"
  | "NOT_APPLICABLE"
  | "UNRESOLVED_NOT_SURE"
  | "UNRESOLVED_LATER"
  | "INCOMPLETE";

export function fieldStatus(def: FieldDef, resp: Resp | undefined, ctx: EvalCtx, recordId: string): FieldStatus {
  if (def.completeWhen && evaluate(def.completeWhen, ctx, recordId)) return "COMPLETE";
  const state: AnswerState = resp?.state ?? "UNANSWERED";
  switch (state) {
    case "NOT_SURE":
      return "UNRESOLVED_NOT_SURE";
    case "COMPLETE_LATER":
      return "UNRESOLVED_LATER";
    case "NOT_APPLICABLE":
      return def.allowNA && (resp?.rationale ?? "").trim() !== "" ? "NOT_APPLICABLE" : "INCOMPLETE";
    case "ANSWERED":
      return isEmptyValue(def, resp?.value) ? "INCOMPLETE" : "COMPLETE";
    default:
      return isEmptyValue(def, resp?.value) ? "INCOMPLETE" : "COMPLETE";
  }
}

export interface Gap {
  fieldId: string;
  recordId: string;
  label: string;
  status: Exclude<FieldStatus, "COMPLETE" | "NOT_APPLICABLE">;
  /** The user's own comment or question for the reviewer, if any. */
  note?: string | null;
}

export interface SubsectionResult {
  id: string;
  active: boolean;
  required: number;
  complete: number;
  unresolved: number;
  gaps: Gap[];
}

function walk(
  items: Item[],
  data: ModelData,
  recordId: string,
  parentRecord: string | null,
  out: SubsectionResult,
) {
  const { ctx, records } = data;
  for (const item of items) {
    if (item.kind === "info") continue;
    if (!isItemActive(item, ctx, recordId)) continue;
    if (item.kind === "field") {
      if (item.hidden) continue;
      if (item.helpRequest) {
        // An active help request is an unresolved item until the user clears it.
        if (ctx.get(item.id, recordId)?.value === true) {
          out.required++;
          out.unresolved++;
          out.gaps.push({
            fieldId: item.id,
            recordId,
            label: "Help requested for this section",
            status: "UNRESOLVED_NOT_SURE",
            note: ctx.get(item.id, recordId)?.rationale ?? null,
          });
        }
        continue;
      }
      if (item.type === "computed" || item.workflow || item.optional) continue;
      out.required++;
      const st = fieldStatus(item, ctx.get(item.id, recordId), ctx, recordId);
      if (st === "COMPLETE" || st === "NOT_APPLICABLE") out.complete++;
      else {
        if (st === "UNRESOLVED_NOT_SURE" || st === "UNRESOLVED_LATER") out.unresolved++;
        out.gaps.push({ fieldId: item.id, recordId, label: item.label, status: st, note: ctx.get(item.id, recordId)?.rationale ?? null });
      }
    } else {
      const col: CollectionDef = item;
      if (col.workflow) continue;
      const recs = recordsFor(records, col.id, recordId === "" ? null : recordId);
      void parentRecord;
      if (col.min) {
        out.required++;
        if (recs.length >= col.min) out.complete++;
        else out.gaps.push({ fieldId: col.id, recordId, label: `${col.label}: add at least ${col.min}`, status: "INCOMPLETE" });
      }
      for (const r of recs) walk(col.items, data, r.id, recordId, out);
    }
  }
}

export function evaluateSubsection(sub: SubsectionDef, data: ModelData): SubsectionResult {
  const out: SubsectionResult = {
    id: sub.id,
    active: isSubsectionActive(sub, data.ctx),
    required: 0,
    complete: 0,
    unresolved: 0,
    gaps: [],
  };
  if (!out.active) return out;
  walk(sub.items, data, "", null, out);
  return out;
}

export interface AssessmentResult {
  subsections: Record<string, SubsectionResult>;
  required: number;
  complete: number;
  /** Share of applicable required items completed. Measures completeness, not GDPR compliance. */
  percent: number;
}

export function evaluateAssessment(data: ModelData): AssessmentResult {
  const subsections: Record<string, SubsectionResult> = {};
  let required = 0;
  let complete = 0;
  for (const sub of SUBSECTIONS) {
    const r = evaluateSubsection(sub, data);
    subsections[sub.id] = r;
    required += r.required;
    complete += r.complete;
  }
  return {
    subsections,
    required,
    complete,
    percent: required === 0 ? 0 : Math.round((complete / required) * 100),
  };
}

export function stageProgress(result: AssessmentResult) {
  return STAGES.map((st) => {
    let required = 0;
    let complete = 0;
    for (const s of st.subsections) {
      required += result.subsections[s.id].required;
      complete += result.subsections[s.id].complete;
    }
    return { id: st.id, required, complete };
  });
}

/** CD-24: interpret a Yes/No answer without changing the stored value. */
export function interpretYesNo(
  def: Pick<FieldDef, "type" | "yesMeaning">,
  value: unknown,
): "SUPPORTS" | "WEIGHS_AGAINST" | "UNRESOLVED" {
  if (def.type !== "yesno" || !def.yesMeaning) return "UNRESOLVED";
  if (value !== "YES" && value !== "NO") return "UNRESOLVED";
  const yesFavourable = def.yesMeaning === "favourable";
  const favourable = value === "YES" ? yesFavourable : !yesFavourable;
  return favourable ? "SUPPORTS" : "WEIGHS_AGAINST";
}
