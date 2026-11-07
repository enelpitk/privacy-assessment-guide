import { describe, expect, it } from "vitest";
import { buildModel, type RecordRow, type RespRow } from "@/domain/model";
import {
  SCREENING_RULES,
  evaluateScreening,
  thresholdTri,
  toQty,
  type QId,
} from "@/domain/screening";

const r = (fieldId: string, value: unknown, state: RespRow["state"] = "ANSWERED", recordId = "", rationale?: string): RespRow => ({
  fieldId, recordId, value, state, rationale,
});
const q = (min: number, max = min) => ({ min, max });
const ev = (rows: RespRow[], recs: RecordRow[] = []) => evaluateScreening(buildModel(rows, recs).ctx);
const sub = (e: ReturnType<typeof ev>, key: string) => e.q5.find((s) => s.key === key)!;

describe("screening rules are versioned template data (not statutory thresholds)", () => {
  it("exposes inclusive thresholds and a rules version", () => {
    expect(SCREENING_RULES.version).toBe("rules-1.0.0");
    expect(SCREENING_RULES.thresholds).toEqual({ q1: 5000, q5: 10000, q6: 50000 });
  });
  it("is inclusive at the threshold and unresolved when an estimate straddles it", () => {
    expect(thresholdTri(q(5000), 5000)).toBe("YES");
    expect(thresholdTri(q(4999), 5000)).toBe("NO");
    expect(thresholdTri(q(4000, 6000), 5000)).toBe("UNRESOLVED");
    expect(thresholdTri(q(5000, 8000), 5000)).toBe("YES");
    expect(thresholdTri(q(100, 4999), 5000)).toBe("NO");
    expect(thresholdTri(null, 5000)).toBe("UNRESOLVED");
  });
  it("rejects malformed quantities", () => {
    expect(toQty({ min: 5, max: 3 })).toBeNull();
    expect(toQty({ min: -1, max: 3 })).toBeNull();
    expect(toQty("12")).toBeNull();
    expect(toQty({ min: 3, max: 3 })).toEqual({ min: 3, max: 3 });
  });
});

describe("question 1", () => {
  it("suggests from the special-category / criminal count and never double counts (one distinct count)", () => {
    expect(ev([r("C.inputs.specialCount", q(5000))]).questions.q1.suggestion).toBe("YES");
    expect(ev([r("C.inputs.specialCount", q(4999))]).questions.q1.suggestion).toBe("NO");
    expect(ev([r("C.inputs.specialCount", q(2000, 9000))]).questions.q1.suggestion).toBe("UNRESOLVED");
    expect(ev([]).questions.q1.suggestion).toBe("UNRESOLVED");
  });
  it("suggests No when section 4.2 says no such data is involved", () => {
    expect(ev([r("E.sc.applies", "NO")]).questions.q1.suggestion).toBe("NO");
  });
});

describe("question 5 – per sub-question populations and combined conditions", () => {
  it("does not use the overall population: 20 000 people overall but 3 000 with financial data is No for 5.1", () => {
    const e = ev([
      r("C.inputs.population", q(20000)),
      r("C.q5.s1", "YES"),
      r("C.q5.s1.count", q(3000)),
    ]);
    expect(sub(e, "s1").result).toBe("NO");
    expect(e.questions.q5.suggestion).toBe("UNRESOLVED"); // other sub-questions are not answered yet; 5.1 alone is not Yes
  });
  it("is Yes only when BOTH the risk applies AND 10 000 or more individuals (inclusive)", () => {
    const yes = ev([r("C.q5.s2", "YES"), r("C.q5.s2.count", q(10000))]);
    expect(sub(yes, "s2").result).toBe("YES");
    expect(yes.questions.q5.suggestion).toBe("YES");
    const just = ev([r("C.q5.s2", "YES"), r("C.q5.s2.count", q(9999))]);
    expect(sub(just, "s2").result).toBe("NO");
  });
  it("is No when either condition is definitely not met, even if the other is unknown", () => {
    expect(sub(ev([r("C.q5.s3", "NO")]), "s3").result).toBe("NO"); // count unknown
    expect(sub(ev([r("C.q5.s3.count", q(500))]), "s3").result).toBe("NO"); // risk unknown
  });
  it("is Unresolved when uncertainty could change the result", () => {
    expect(sub(ev([r("C.q5.s4", "YES"), r("C.q5.s4.count", q(8000, 12000))]), "s4").result).toBe("UNRESOLVED");
    expect(sub(ev([r("C.q5.s4", "YES")]), "s4").result).toBe("UNRESOLVED"); // no count
    expect(sub(ev([r("C.q5.s4", undefined, "NOT_SURE"), r("C.q5.s4.count", q(20000))]), "s4").result).toBe("UNRESOLVED");
  });
  it("never adds populations across sub-questions", () => {
    const e = ev([
      r("C.q5.s1", "YES"), r("C.q5.s1.count", q(6000)),
      r("C.q5.s2", "YES"), r("C.q5.s2.count", q(6000)),
    ]);
    expect(sub(e, "s1").result).toBe("NO");
    expect(sub(e, "s2").result).toBe("NO");
    expect(e.questions.q5.suggestion).not.toBe("YES");
  });
  it("one qualifying Yes stays Yes while another sub-question is unresolved", () => {
    const e = ev([
      r("C.q5.s1", "YES"), r("C.q5.s1.count", q(15000)),
      r("C.q5.s5", "YES"), // unresolved: no count
    ]);
    expect(e.questions.q5.suggestion).toBe("YES");
    expect(sub(e, "s5").result).toBe("UNRESOLVED");
  });
  it("checks 5.6 against its own wording with the same two-condition structure", () => {
    expect(sub(ev([r("C.q5.s6", "YES"), r("C.q5.s6.count", q(12000))]), "s6").result).toBe("YES");
    expect(sub(ev([r("C.q5.s6", "NO"), r("C.q5.s6.count", q(12000))]), "s6").result).toBe("NO");
  });
  it("flags a sub-population larger than the total without silently adjusting or turning it into No", () => {
    const e = ev([
      r("C.inputs.population", q(20000)),
      r("C.q5.s1", "YES"),
      r("C.q5.s1.count", q(30000)),
    ]);
    expect(sub(e, "s1").inconsistent).toBe(true);
    expect(sub(e, "s1").result).toBe("YES"); // counted as entered; not converted to No
    expect(e.warnings.some((w) => w.includes("larger than the total"))).toBe(true);
  });
});

describe("questions 2 and 4 (compound conditions)", () => {
  it("question 2 needs all three parts", () => {
    const parts = (a: string, b: string, c: string) =>
      ev([r("C.q2.systematic", a), r("C.q2.automated", b), r("C.q2.significant", c)]).questions.q2.suggestion;
    expect(parts("YES", "YES", "YES")).toBe("YES");
    expect(parts("YES", "NO", "YES")).toBe("NO");
    expect(parts("YES", "YES", "")).toBe("UNRESOLVED");
  });
  it("question 4 needs systematic AND large-scale", () => {
    const e = (a: string, b: string) => ev([r("C.q4.systematic", a), r("C.q4.largeScale", b)]).questions.q4.suggestion;
    expect(e("YES", "YES")).toBe("YES");
    expect(e("YES", "NO")).toBe("NO");
    expect(e("YES", "")).toBe("UNRESOLVED");
  });
  it("question 3 has no derived suggestion", () => {
    expect(ev([]).questions.q3.noSuggestion).toBe(true);
  });
});

describe("question 6 – provisional handling of 'not already covered'", () => {
  it("flags for DPO review when the population is at least 50 000 and any of Q1-Q5 is confirmed Yes", () => {
    const e = ev([r("C.inputs.population", q(60000)), r("C.q1", "YES")]);
    expect(e.questions.q6.suggestion).toBe("YES");
    expect(e.questions.q6.flags.join(" ")).toContain("Q6_NOT_ALREADY_COVERED");
    expect(e.warnings.join(" ")).toContain("different people or different data");
  });
  it("does not flag when no earlier question is Yes, and never silently treats the ambiguity as No", () => {
    const none = ev([r("C.inputs.population", q(60000)), r("C.q1", "NO")]);
    expect(none.questions.q6.flags).toEqual([]);
    expect(none.questions.q6.suggestion).toBe("YES");
    const flagged = ev([r("C.inputs.population", q(60000)), r("C.q3", "YES")]);
    expect(flagged.questions.q6.suggestion).not.toBe("NO");
  });
  it("is No below the threshold and unresolved for a straddling estimate", () => {
    expect(ev([r("C.inputs.population", q(49999))]).questions.q6.suggestion).toBe("NO");
    expect(ev([r("C.inputs.population", q(40000, 60000))]).questions.q6.suggestion).toBe("UNRESOLVED");
  });
});

describe("question 7", () => {
  const recs: RecordRow[] = [{ id: "s1", collection: "E.share", ordering: 0 }];
  it("suggests Yes for a recipient location that looks outside the EU/EEA, but only as a suggestion", () => {
    const e = ev([r("E.share.location", "Mumbai, India", "ANSWERED", "s1")], recs);
    expect(e.questions.q7.suggestion).toBe("YES");
    expect(e.questions.q7.confirmed).toBe("UNRESOLVED"); // not applied until confirmed
  });
  it("stays unresolved for locations it does not recognise", () => {
    expect(ev([r("E.share.location", "Tallinn, Estonia", "ANSWERED", "s1")], recs).questions.q7.suggestion).toBe("UNRESOLVED");
  });
});

describe("independent outcomes", () => {
  const confirm = (m: Partial<Record<QId, string>>): RespRow[] => Object.entries(m).map(([k, v]) => r(`C.${k}`, v));

  it("any confirmed Yes in Q1-Q6 indicates a full DPIA", () => {
    for (const k of ["q1", "q2", "q3", "q4", "q5", "q6"] as QId[]) {
      const o = ev(confirm({ [k]: "YES" })).outcomes;
      expect(o.fullDpiaIndicated, k).toBe(true);
      expect(o.fullBecause).toEqual([k]);
    }
  });
  it("question 7 alone indicates TIA follow-up and never a full DPIA", () => {
    const o = ev(confirm({ q7: "YES" })).outcomes;
    expect(o.tiaIndicated).toBe(true);
    expect(o.fullDpiaIndicated).toBe(false);
  });
  it("both can be indicated independently", () => {
    const o = ev(confirm({ q1: "YES", q7: "YES" })).outcomes;
    expect(o.fullDpiaIndicated && o.tiaIndicated).toBe(true);
  });
  it("lists unresolved questions separately and they never cancel a positive indication", () => {
    const e = ev([r("C.q1", "YES"), r("C.q2", undefined, "NOT_SURE"), r("C.q3", undefined, "COMPLETE_LATER")]);
    expect(e.outcomes.fullDpiaIndicated).toBe(true);
    const un = e.outcomes.unresolved.map((u) => u.q);
    expect(un).toContain("q2");
    expect(un).toContain("q3");
    expect(e.outcomes.unresolved.find((u) => u.q === "q2")!.reason).toContain("Not sure");
  });
  it("'Not sure' is never treated as No, even if a value was left behind", () => {
    const e = ev([r("C.q3", "NO", "NOT_SURE")]);
    expect(e.questions.q3.confirmed).toBe("UNRESOLVED");
    expect(e.outcomes.headline).toBe("NO_CONFIRMED_INDICATION");
  });
  it("only says there is no screening indication when every question is answered and none is Yes", () => {
    const all = Object.fromEntries((["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as QId[]).map((k) => [k, "NO"]));
    expect(ev(confirm(all)).outcomes.headline).toBe("NO_INDICATION");
    expect(ev([]).outcomes.headline).toBe("NO_CONFIRMED_INDICATION");
  });
});

describe("suggestions need confirmation and overrides need an explanation", () => {
  it("does not confirm anything by itself", () => {
    const e = ev([r("C.inputs.specialCount", q(9000))]);
    expect(e.questions.q1.suggestion).toBe("YES");
    expect(e.questions.q1.confirmed).toBe("UNRESOLVED");
    expect(e.outcomes.fullDpiaIndicated).toBe(false);
  });
  it("flags an override without a rationale, and accepts one with a rationale", () => {
    const base = [r("C.inputs.specialCount", q(9000)), r("C.q1", "NO")];
    const without = ev(base).questions.q1;
    expect(without.override).toBe(true);
    expect(without.overrideNeedsRationale).toBe(true);
    const withR = ev([...base, r("C.q1.rationale", "Counted twice", "ANSWERED")]).questions.q1;
    expect(withR.override).toBe(true);
    expect(withR.overrideNeedsRationale).toBe(false);
  });
  it("confirming the suggestion is not an override", () => {
    const q1 = ev([r("C.inputs.specialCount", q(9000)), r("C.q1", "YES")]).questions.q1;
    expect(q1.override).toBe(false);
  });
});
