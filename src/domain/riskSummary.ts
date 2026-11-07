// Risk register view and checks (rules RISK-*, docs/template-rules.md). Pure.
import { recordsFor, type ModelData, type RecordRow } from "./model";
import { riskCategory, riskScore, toLevel, type RiskCategory } from "./risk";

export interface Score {
  p: 1 | 2 | 3 | 4;
  i: 1 | 2 | 3 | 4;
  score: number;
  category: RiskCategory;
}

export interface MeasureView {
  id: string;
  description: string;
  status: string; // NOT_STARTED | IN_PROGRESS | COMPLETED | ""
  due: string; // YYYY-MM-DD or ""
  overdue: boolean;
}

export interface RiskView {
  recordId: string;
  number: number;
  name: string;
  inherent: Score | null;
  residual: Score | null;
  /** Optional target after planned measures. Separate from current residual risk. */
  target: Score | null;
  measures: MeasureView[];
  fromExample: string;
  exampleConfirmed: boolean;
  flags: string[];
}

export type MatrixMode = "inherent" | "residual" | "target";

function score(p: unknown, i: unknown): Score | null {
  const pl = toLevel(p);
  const il = toLevel(i);
  const s = riskScore(pl, il);
  if (pl === null || il === null || s === null) return null;
  return { p: pl, i: il, score: s, category: riskCategory(s)! };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function buildRisks(data: ModelData, today: Date = new Date()): RiskView[] {
  const { ctx, records } = data;
  const todayIso = today.toISOString().slice(0, 10);
  return recordsFor(records as RecordRow[], "J.risk", null).map((rec, idx) => {
    const g = (f: string) => ctx.get(f, rec.id)?.value;
    const inherent = score(g("J.risk.inh.p"), g("J.risk.inh.i"));
    const residual = score(g("J.risk.res.p"), g("J.risk.res.i"));
    const tp = g("J.risk.target.p");
    const ti = g("J.risk.target.i");
    const target = score(tp, ti);
    const measures: MeasureView[] = recordsFor(records as RecordRow[], "J.risk.measure", rec.id).map((m) => {
      const due = str(ctx.get("J.risk.due", m.id)?.value);
      const status = str(ctx.get("J.risk.status", m.id)?.value);
      return {
        id: m.id,
        description: str(ctx.get("J.risk.measures", m.id)?.value),
        status,
        due,
        overdue: due !== "" && due < todayIso && status !== "COMPLETED",
      };
    });
    const fromExample = str(g("J.risk.fromExample"));
    const exampleConfirmed = g("J.risk.confirmed") === true;
    const flags: string[] = [];
    if (!inherent) flags.push("Inherent risk: Not assessed.");
    if (!residual) flags.push("Current residual risk: Not assessed.");
    if (fromExample && !exampleConfirmed) flags.push("This risk started from an example. Adapt it to your processing and confirm it.");
    if (measures.length === 0) flags.push("No mitigation measure recorded yet.");
    if (inherent && residual && residual.score < inherent.score && !measures.some((m) => m.status === "COMPLETED")) {
      flags.push(
        "Current residual risk is lower than the inherent risk, but no measure is marked Completed. Current residual risk should reflect only measures that are already implemented; planned measures belong in the target risk.",
      );
    }
    if (residual?.category === "HIGH") {
      flags.push(
        "Current residual risk is HIGH: documented additional actions and a specialist review are needed. The template says supervisory authority consultation is required if residual risks remain HIGH after mitigation and cannot be reduced further; the DPO and owner decide. A score alone does not decide this.",
      );
    }
    return {
      recordId: rec.id,
      number: idx + 1,
      name: str(g("J.risk.name")),
      inherent,
      residual,
      target,
      measures,
      fromExample,
      exampleConfirmed,
      flags,
    };
  });
}

/** Risks grouped into matrix cells, keyed "p,i". Only assessed risks are plotted. */
export function matrixCells(risks: RiskView[], mode: MatrixMode): Map<string, RiskView[]> {
  const cells = new Map<string, RiskView[]>();
  for (const r of risks) {
    const s = mode === "inherent" ? r.inherent : mode === "residual" ? r.residual : r.target;
    if (!s) continue;
    const key = `${s.p},${s.i}`;
    cells.set(key, [...(cells.get(key) ?? []), r]);
  }
  return cells;
}

export function consultationPrompt(risks: RiskView[]): RiskView[] {
  return risks.filter((r) => r.residual?.category === "HIGH");
}

export const RISK_EXAMPLES = [
  {
    key: "ex1",
    name: "Processing without legal basis",
    description: "Data subjects have no knowledge their data is being used, no ability to consent, object, or exercise rights.",
  },
  {
    key: "ex2",
    name: "Unauthorised access by third party",
    description: "Personal data leaked or stolen due to cyberattack. The data subject could become a target for fraudulent activities.",
  },
  {
    key: "ex3",
    name: "Third-Party Processor Risk",
    description: "Processor fails to provide adequate security or compliance guarantees.",
  },
] as const;
