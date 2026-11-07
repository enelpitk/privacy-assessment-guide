// Source risk scales (rule RISK-SCALE-P, RISK-SCALE-I, RISK-SCORE, RISK-CAT).
// Missing scores are "Not assessed", never 0.

export type RiskCategory = "LOW" | "MEDIUM" | "HIGH";

export function isLevel(n: unknown): n is 1 | 2 | 3 | 4 {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

export function toLevel(v: unknown): 1 | 2 | 3 | 4 | null {
  const n = typeof v === "string" ? Number(v) : v;
  return isLevel(n) ? n : null;
}

/** Probability x impact, or null when either input is missing/invalid. */
export function riskScore(p: unknown, i: unknown): number | null {
  const pl = toLevel(p);
  const il = toLevel(i);
  if (pl === null || il === null) return null;
  return pl * il;
}

/** Low 1-4, Medium 5-8, High 9-16. */
export function riskCategory(score: number | null): RiskCategory | null {
  if (score === null) return null;
  if (score <= 4) return "LOW";
  if (score <= 8) return "MEDIUM";
  return "HIGH";
}

export function describeRisk(p: unknown, i: unknown): string {
  const s = riskScore(p, i);
  if (s === null) return "Not assessed";
  const c = riskCategory(s);
  return `${s} ${c}`;
}

export const PROBABILITY_SCALE = [
  {
    value: "1",
    label: "1 – Very low",
    description:
      "Remote chance of occurrence; would require multiple failures or unusual circumstances. No history of similar incidents (happens once in 100 years).",
  },
  {
    value: "2",
    label: "2 – Low",
    description:
      "Could occur under certain conditions but not expected in normal operations. Unlikely to happen soon (happen once in 10 years).",
  },
  {
    value: "3",
    label: "3 – Medium",
    description:
      "Reasonable expectation of occurrence given current controls and practices. Similar incidents have occurred before. Likely to happen, but not usual (happens once a year).",
  },
  {
    value: "4",
    label: "4 – High",
    description:
      "Expected to occur in most circumstances. Existing vulnerabilities or inadequate controls make this highly probable. Common to happen (happens every 1-2 months).",
  },
] as const;

export const IMPACT_SCALE = [
  {
    value: "1",
    label: "1 – Insignificant",
    description:
      "Minimal or no effect on data subjects. Minor inconvenience at most; easily reversible with no lasting consequences. (No lasting effect)",
  },
  {
    value: "2",
    label: "2 – Minor",
    description:
      "Minor inconvenience or temporary distress. Limited real-world effect, data subjects can overcome without significant difficulty. Temporary effects only. (Temporary effects)",
  },
  {
    value: "3",
    label: "3 – Severe",
    description:
      "Significant inconvenience or distress. Individuals must take action to address consequences. (Lasting effect)",
  },
  {
    value: "4",
    label: "4 – Very severe",
    description:
      "Serious or irreversible harm to individuals — financial loss, reputational damage, discrimination, psychological distress, or impact on employment. May affect fundamental rights, physical safety, or life circumstances. Effects may be impossible to overcome. (Severe / irreversible harm)",
  },
] as const;
