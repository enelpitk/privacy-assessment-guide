// Pure condition evaluation. No database or framework imports.

export type AnswerState =
  | "ANSWERED"
  | "UNANSWERED"
  | "NOT_APPLICABLE"
  | "NOT_SURE"
  | "COMPLETE_LATER";

export interface Resp {
  value: unknown;
  state: AnswerState;
  rationale?: string | null;
}

export type Scope = "global" | "record" | "parent" | "any";

export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | {
      f: string;
      scope?: Scope;
      eq?: unknown;
      ne?: unknown;
      includes?: unknown;
      includesOtherThan?: unknown;
      stateIn?: AnswerState[];
    }
  | { yesOrUnsure: string; scope?: Scope }
  | { hasRecords: string }
  | { scoreGte: { p: string; i: string; gte: number } };

export interface EvalCtx {
  get(fieldId: string, recordId: string): Resp | undefined;
  /** Responses for a field across all live records. */
  anyRecord(fieldId: string): Resp[];
  /** Live record ids of a collection. */
  recordsOf(collection: string): string[];
  parentOf(recordId: string): string | undefined;
}

function resolve(
  fieldId: string,
  scope: Scope,
  ctx: EvalCtx,
  recordId: string,
): (Resp | undefined)[] {
  switch (scope) {
    case "record":
      return [ctx.get(fieldId, recordId)];
    case "parent": {
      const p = ctx.parentOf(recordId);
      return [p ? ctx.get(fieldId, p) : undefined];
    }
    case "any": {
      const all = ctx.anyRecord(fieldId);
      return all.length ? all : [undefined];
    }
    default:
      return [ctx.get(fieldId, "")];
  }
}

function one(
  r: Resp | undefined,
  c: Extract<Cond, { f: string }>,
): boolean {
  const v = r?.value;
  if (c.eq !== undefined && v !== c.eq) return false;
  if (c.ne !== undefined && v === c.ne) return false;
  if (c.includes !== undefined) {
    if (!Array.isArray(v) || !v.includes(c.includes)) return false;
  }
  if (c.includesOtherThan !== undefined) {
    if (!Array.isArray(v) || !v.some((x) => x !== c.includesOtherThan)) {
      return false;
    }
  }
  if (c.stateIn !== undefined) {
    const s: AnswerState = r?.state ?? "UNANSWERED";
    if (!c.stateIn.includes(s)) return false;
  }
  return true;
}

export function evaluate(cond: Cond, ctx: EvalCtx, recordId = ""): boolean {
  if ("all" in cond) return cond.all.every((c) => evaluate(c, ctx, recordId));
  if ("any" in cond) return cond.any.some((c) => evaluate(c, ctx, recordId));
  if ("not" in cond) return !evaluate(cond.not, ctx, recordId);
  if ("hasRecords" in cond) return ctx.recordsOf(cond.hasRecords).length > 0;
  if ("scoreGte" in cond) {
    const p = Number(ctx.get(cond.scoreGte.p, recordId)?.value);
    const i = Number(ctx.get(cond.scoreGte.i, recordId)?.value);
    if (!Number.isInteger(p) || !Number.isInteger(i)) return false;
    return p * i >= cond.scoreGte.gte;
  }
  if ("yesOrUnsure" in cond) {
    const rs = resolve(cond.yesOrUnsure, cond.scope ?? "global", ctx, recordId);
    return rs.some((r) => r?.value === "YES" || r?.state === "NOT_SURE");
  }
  const rs = resolve(cond.f, cond.scope ?? "global", ctx, recordId);
  return rs.some((r) => one(r, cond));
}
