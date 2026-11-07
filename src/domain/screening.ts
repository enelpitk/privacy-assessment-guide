// Screening rules (docs/template-rules.md, rules-1.0.0). Pure: no database or framework imports.
// These are the template's ORGANISATIONAL screening rules, not statutory thresholds. Results are
// indications for the DPO to review. Unknown answers are never treated as "No".
import type { EvalCtx, Resp } from "./conditions";

export const SCREENING_RULES = {
  version: "rules-1.0.0",
  /** Inclusive ("or more"). Configurable template data. */
  thresholds: { q1: 5000, q5: 10000, q6: 50000 },
} as const;

export type Tri = "YES" | "NO" | "UNRESOLVED";
export type QId = "q1" | "q2" | "q3" | "q4" | "q5" | "q6" | "q7";
export const QUESTION_IDS: QId[] = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];

export interface Qty {
  min: number;
  max: number;
}

export function toQty(v: unknown): Qty | null {
  const q = v as { min?: unknown; max?: unknown } | null | undefined;
  if (!q || typeof q !== "object") return null;
  if (typeof q.min !== "number" || typeof q.max !== "number") return null;
  if (!Number.isFinite(q.min) || !Number.isFinite(q.max) || q.min < 0 || q.max < q.min) return null;
  return { min: q.min, max: q.max };
}

/** YES if the whole range is at or above the threshold, NO if wholly below, otherwise UNRESOLVED (straddles or unknown). */
export function thresholdTri(q: Qty | null, threshold: number): Tri {
  if (!q) return "UNRESOLVED";
  if (q.min >= threshold) return "YES";
  if (q.max < threshold) return "NO";
  return "UNRESOLVED";
}

/** A confirmed answer: only an answered Yes/No counts. Not sure, complete later and blank are unresolved. */
export function confirmedTri(r: Resp | undefined): Tri {
  if (!r || r.state !== "ANSWERED") return "UNRESOLVED";
  return r.value === "YES" ? "YES" : r.value === "NO" ? "NO" : "UNRESOLVED";
}

export function allOf(parts: Tri[]): Tri {
  if (parts.includes("NO")) return "NO";
  return parts.every((p) => p === "YES") ? "YES" : "UNRESOLVED";
}

const qtyOf = (r: Resp | undefined): Qty | null => (r && r.state === "ANSWERED" ? toQty(r.value) : null);
const fmtQty = (q: Qty) => (q.min === q.max ? q.min.toLocaleString("en-GB") : `${q.min.toLocaleString("en-GB")} to ${q.max.toLocaleString("en-GB")}`);

/** Illustrative hints for the Q7 suggestion only. The user always confirms. */
export const NON_EEA_HINTS = [
  "united states", "usa", "u.s.", "united kingdom", "uk", "india", "china", "singapore", "japan", "canada",
  "australia", "switzerland", "brazil", "south africa", "united arab emirates", "uae", "hong kong", "israel", "turkey",
];

export interface Q5Sub {
  key: "s1" | "s2" | "s3" | "s4" | "s5" | "s6";
  label: string;
  risk: Tri;
  count: Qty | null;
  countTri: Tri;
  result: Tri;
  inconsistent: boolean;
  basis: string;
}

export interface QResult {
  id: QId;
  fieldId: string;
  suggestion: Tri;
  basis: string[];
  noSuggestion: boolean;
  confirmed: Tri;
  /** Confirmed definite answer differs from a definite suggestion. */
  override: boolean;
  /** An override must be explained in the rationale. */
  overrideNeedsRationale: boolean;
  flags: string[];
}

export interface ScreeningEvaluation {
  rulesVersion: string;
  questions: Record<QId, QResult>;
  q5: Q5Sub[];
  population: Qty | null;
  outcomes: {
    fullDpiaIndicated: boolean;
    fullBecause: QId[];
    tiaIndicated: boolean;
    unresolved: { q: QId; reason: string }[];
    headline: "FULL_DPIA_INDICATED" | "NO_INDICATION" | "NO_CONFIRMED_INDICATION";
  };
  warnings: string[];
}

const Q5_LABELS: Record<Q5Sub["key"], string> = {
  s1: "5.1 Exposure to financial data",
  s2: "5.2 Identity theft or fraud if compromised",
  s3: "5.3 Risk to property",
  s4: "5.4 Discriminatory outcomes",
  s5: "5.5 Vulnerable data subjects",
  s6: "5.6 Real-time tracking of location or movement",
};

export const Q_LABEL: Record<QId, string> = {
  q1: "Question 1 – special category or criminal data (5000 or more individuals)",
  q2: "Question 2 – systematic and extensive evaluation, scoring or profiling",
  q3: "Question 3 – new technologies",
  q4: "Question 4 – monitoring of a publicly accessible area",
  q5: "Question 5 – 10 000 or more individuals and specific risks",
  q6: "Question 6 – other personal data of 50 000 or more individuals",
  q7: "Question 7 – shared with or accessible outside the EU/EEA",
};

function rationaleOf(ctx: EvalCtx, fieldId: string): string {
  return String(ctx.get(`${fieldId}.rationale`, "")?.value ?? "").trim();
}

export function evaluateScreening(ctx: EvalCtx): ScreeningEvaluation {
  const T = SCREENING_RULES.thresholds;
  const warnings: string[] = [];
  const population = qtyOf(ctx.get("C.inputs.population", ""));
  const confirmed = (id: string) => confirmedTri(ctx.get(id, ""));

  // ---- Q5: each sub-question needs BOTH the specific risk AND >= 10 000 individuals to whom it applies.
  const q5: Q5Sub[] = (["s1", "s2", "s3", "s4", "s5", "s6"] as const).map((key) => {
    const id = `C.q5.${key}`;
    const risk = confirmed(id);
    const count = qtyOf(ctx.get(`${id}.count`, ""));
    const countTri = thresholdTri(count, T.q5);
    let result: Tri;
    if (risk === "NO" || countTri === "NO") result = "NO";
    else if (risk === "YES" && countTri === "YES") result = "YES";
    else result = "UNRESOLVED";
    // A sub-population larger than the stated total is inconsistent; never adjusted silently.
    const inconsistent = Boolean(count && population && count.min > population.max);
    if (inconsistent) {
      warnings.push(
        `${Q5_LABELS[key]}: the number of individuals (${fmtQty(count!)}) is larger than the total entered in 3.1 (${fmtQty(population!)}). Correct one of them or explain the difference in the rationale.`,
      );
    }
    const riskText = risk === "YES" ? "risk applies" : risk === "NO" ? "risk does not apply" : "risk answer unresolved";
    const countText = count ? `${fmtQty(count)} individuals` : "number of individuals not given";
    return {
      key,
      label: Q5_LABELS[key],
      risk,
      count,
      countTri,
      result,
      inconsistent,
      basis: `${riskText}; ${countText} (threshold ${T.q5.toLocaleString("en-GB")}, counts are not added across sub-questions)`,
    };
  });
  const q5Agg: Tri = q5.some((s) => s.result === "YES")
    ? "YES"
    : q5.some((s) => s.result === "UNRESOLVED")
      ? "UNRESOLVED"
      : "NO";

  // ---- Suggestions
  const suggestions: Record<QId, { s: Tri; basis: string[]; none?: boolean; flags?: string[] }> = {
    q1: (() => {
      const c = qtyOf(ctx.get("C.inputs.specialCount", ""));
      if (c) {
        return {
          s: thresholdTri(c, T.q1),
          basis: [`${fmtQty(c)} individuals with special category or criminal data (threshold ${T.q1.toLocaleString("en-GB")}; each person counted once).`],
        };
      }
      if (ctx.get("E.sc.applies", "")?.value === "NO") {
        return { s: "NO" as Tri, basis: ["Section 4.2 says no special category or criminal offence data is involved."] };
      }
      return { s: "UNRESOLVED" as Tri, basis: ["Enter the number of individuals with special category or criminal data in 3.1."] };
    })(),
    q2: (() => {
      const parts = ["C.q2.systematic", "C.q2.automated", "C.q2.significant"].map(confirmed);
      return {
        s: allOf(parts),
        basis: [
          "All three parts must apply: systematic and extensive evaluation, based on automated processing, with legal or similarly significant effects.",
          `Your part answers: ${parts.map((p) => (p === "YES" ? "Yes" : p === "NO" ? "No" : "unresolved")).join(", ")}.`,
        ],
      };
    })(),
    q3: { s: "UNRESOLVED", none: true, basis: ["This question has no counts to derive an answer from. Answer it yourself."] },
    q4: (() => {
      const parts = ["C.q4.systematic", "C.q4.largeScale"].map(confirmed);
      return {
        s: allOf(parts),
        basis: [
          "Both parts must apply: systematic and large-scale.",
          `Your part answers: ${parts.map((p) => (p === "YES" ? "Yes" : p === "NO" ? "No" : "unresolved")).join(", ")}.`,
        ],
      };
    })(),
    q5: {
      s: q5Agg,
      basis: [
        "Yes if at least one of 5.1 to 5.6 is Yes (the risk applies AND it applies to 10 000 or more individuals). Counts are never added together.",
        ...q5.map((s) => `${s.label}: ${s.result === "YES" ? "Yes" : s.result === "NO" ? "No" : "unresolved"} – ${s.basis}.`),
      ],
    },
    q6: (() => {
      const s = thresholdTri(population, T.q6);
      const flags: string[] = [];
      const anyYes = (["q1", "q2", "q3", "q4", "q5"] as const).some((q) => {
        const id = q === "q5" ? "C.q5" : `C.${q}`;
        return confirmed(id) === "YES";
      });
      if (population && population.max >= T.q6 && anyYes) {
        flags.push(
          "Q6_NOT_ALREADY_COVERED: the template asks for personal data “not already covered by questions above”. It is not clear whether that means different people or different data, so this answer is flagged for the DPO. It is not treated as No.",
        );
      }
      return {
        s,
        basis: [
          population
            ? `${fmtQty(population)} individuals in total (threshold ${T.q6.toLocaleString("en-GB")}).`
            : "Enter the approximate total number of individuals in 3.1.",
        ],
        flags,
      };
    })(),
    q7: (() => {
      const locs = ctx
        .anyRecord("E.share.location")
        .map((r) => (typeof r.value === "string" ? r.value : ""))
        .filter(Boolean);
      const hits = locs.filter((l) => NON_EEA_HINTS.some((h) => new RegExp(`(^|[^a-z])${h.replace(/\./g, "\\.")}([^a-z]|$)`, "i").test(l)));
      if (hits.length) {
        return { s: "YES" as Tri, basis: [`Recipient location entered in 4.7 may be outside the EU/EEA: ${hits.map((h) => `“${h}”`).join(", ")}. Check each one.`] };
      }
      if (ctx.get("E.share.none", "")?.value === true && ctx.get("B.proc.none", "")?.value === true) {
        return { s: "NO" as Tri, basis: ["No data sharing and no processors are recorded."] };
      }
      return {
        s: "UNRESOLVED" as Tri,
        basis: [
          locs.length
            ? `${locs.length} recipient location${locs.length === 1 ? "" : "s"} entered in 4.7; none is recognised as outside the EU/EEA, but check them yourself.`
            : "No recipient locations have been entered in 4.7.",
        ],
      };
    })(),
  };

  const questions = {} as Record<QId, QResult>;
  for (const q of QUESTION_IDS) {
    const fieldId = `C.${q}`;
    const c = confirmed(fieldId);
    const sg = suggestions[q];
    const definiteSuggestion = !sg.none && sg.s !== "UNRESOLVED";
    const override = definiteSuggestion && c !== "UNRESOLVED" && c !== sg.s;
    questions[q] = {
      id: q,
      fieldId,
      suggestion: sg.s,
      basis: sg.basis,
      noSuggestion: Boolean(sg.none),
      confirmed: c,
      override,
      overrideNeedsRationale: override && rationaleOf(ctx, fieldId) === "",
      flags: sg.flags ?? [],
    };
    if (questions[q].overrideNeedsRationale) {
      warnings.push(`${Q_LABEL[q]}: your confirmed answer differs from the suggested answer. Explain why in the rationale.`);
    }
    for (const f of questions[q].flags) warnings.push(`${Q_LABEL[q]}: ${f}`);
  }

  // ---- Independent outcomes
  const fullBecause = (["q1", "q2", "q3", "q4", "q5", "q6"] as const).filter((q) => questions[q].confirmed === "YES");
  const unresolved = QUESTION_IDS.filter((q) => questions[q].confirmed === "UNRESOLVED").map((q) => {
    const r = ctx.get(`C.${q}`, "");
    const reason =
      r?.state === "NOT_SURE" ? "marked “Not sure – I need help”" : r?.state === "COMPLETE_LATER" ? "marked “Complete later”" : "not answered yet";
    return { q, reason };
  });
  const full = fullBecause.length > 0;
  return {
    rulesVersion: SCREENING_RULES.version,
    questions,
    q5,
    population,
    outcomes: {
      fullDpiaIndicated: full,
      fullBecause: [...fullBecause],
      tiaIndicated: questions.q7.confirmed === "YES",
      unresolved,
      headline: full ? "FULL_DPIA_INDICATED" : unresolved.length ? "NO_CONFIRMED_INDICATION" : "NO_INDICATION",
    },
    warnings,
  };
}
