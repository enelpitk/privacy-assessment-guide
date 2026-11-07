import { describe, expect, it } from "vitest";
import { fieldIndex, subsectionById } from "@/content";
import {
  buildModel,
  evaluateAssessment,
  evaluateSubsection,
  fieldStatus,
  interpretYesNo,
  type RecordRow,
  type RespRow,
} from "@/domain/model";
import { decideRevision } from "@/domain/concurrency";
import { describeRisk, riskCategory, riskScore } from "@/domain/risk";
import { isVagueCategory } from "@/domain/guidance";
import { isEmptyValue, validateValue } from "@/domain/validation";

const r = (fieldId: string, value: unknown, state: RespRow["state"] = "ANSWERED", recordId = "", rationale?: string): RespRow => ({
  fieldId, recordId, value, state, rationale,
});
const def = (id: string) => fieldIndex.get(id)!.def;

describe("conditional activity and answer preservation", () => {
  it("shows the change description only when 'Changed processing' is selected", () => {
    const hidden = buildModel([r("A.reason", ["new"])], []);
    const shown = buildModel([r("A.reason", ["new", "changed"])], []);
    const a = evaluateSubsection(subsectionById.get("A2")!, hidden);
    const b = evaluateSubsection(subsectionById.get("A2")!, shown);
    expect(a.gaps.some((g) => g.fieldId === "A.changeDescription")).toBe(false);
    expect(b.gaps.some((g) => g.fieldId === "A.changeDescription")).toBe(true);
  });

  it("preserves a hidden answer, excludes it from completeness, and restores it when active again", () => {
    const answer = r("A.changeDescription", "Moved the data to a new system");
    // condition off: stored value still present in the data, not counted
    const off = buildModel([r("A.reason", ["new"]), answer], []);
    const offRes = evaluateSubsection(subsectionById.get("A2")!, off);
    expect(off.ctx.get("A.changeDescription", "")?.value).toBe("Moved the data to a new system");
    expect(offRes.gaps.some((g) => g.fieldId === "A.changeDescription")).toBe(false);
    // condition on again: same stored answer now counts as complete
    const on = buildModel([r("A.reason", ["new", "changed"]), answer], []);
    const onRes = evaluateSubsection(subsectionById.get("A2")!, on);
    expect(on.ctx.get("A.changeDescription", "")?.value).toBe("Moved the data to a new system");
    expect(onRes.gaps.some((g) => g.fieldId === "A.changeDescription")).toBe(false);
    expect(onRes.required).toBe(offRes.required + 1);
    expect(onRes.complete).toBe(offRes.complete + 1);
  });

  it("hides processor records when 'No processors involved' is ticked but keeps them", () => {
    const recs: RecordRow[] = [{ id: "p1", collection: "B.proc", ordering: 0 }];
    const rows = [r("B.proc.name", "ent1", "ANSWERED", "p1")];
    const withProc = evaluateSubsection(subsectionById.get("B2")!, buildModel(rows, recs));
    expect(withProc.gaps.some((g) => g.fieldId === "B.proc.role")).toBe(true);
    const none = buildModel([...rows, r("B.proc.none", true)], recs);
    const noneRes = evaluateSubsection(subsectionById.get("B2")!, none);
    expect(noneRes.gaps).toEqual([]);
    expect(none.ctx.get("B.proc.name", "p1")?.value).toBe("ent1");
  });

  it("requires the Article 9 condition only for non-criminal data, and a separate criminal authorisation", () => {
    const recs: RecordRow[] = [{ id: "s1", collection: "E.sc", ordering: 0 }];
    const crim = buildModel(
      [r("E.sc.applies", "YES"), r("E.sc.categories", ["criminal"], "ANSWERED", "s1")],
      recs,
    );
    const gaps = evaluateSubsection(subsectionById.get("E2")!, crim).gaps.map((g) => g.fieldId);
    expect(gaps).toContain("E.sc.criminalAuth");
    expect(gaps).not.toContain("E.sc.cond");
    const health = buildModel(
      [r("E.sc.applies", "YES"), r("E.sc.categories", ["health"], "ANSWERED", "s1")],
      recs,
    );
    const g2 = evaluateSubsection(subsectionById.get("E2")!, health).gaps.map((g) => g.fieldId);
    expect(g2).toContain("E.sc.cond");
    expect(g2).not.toContain("E.sc.criminalAuth");
  });

  it("activates the AI subsections when AI is Yes or Not sure, but not when No", () => {
    const f2 = subsectionById.get("F2")!;
    expect(evaluateSubsection(f2, buildModel([r("F.applies", "NO")], [])).active).toBe(false);
    expect(evaluateSubsection(f2, buildModel([r("F.applies", "YES")], [])).active).toBe(true);
    expect(evaluateSubsection(f2, buildModel([r("F.applies", "", "NOT_SURE")], [])).active).toBe(true);
  });

  it("requires additional actions only when current residual risk is HIGH", () => {
    const recs: RecordRow[] = [{ id: "k1", collection: "J.risk", ordering: 0 }];
    const high = buildModel(
      [r("J.risk.res.p", "3", "ANSWERED", "k1"), r("J.risk.res.i", "4", "ANSWERED", "k1")],
      recs,
    );
    const low = buildModel(
      [r("J.risk.res.p", "2", "ANSWERED", "k1"), r("J.risk.res.i", "2", "ANSWERED", "k1")],
      recs,
    );
    const j2 = subsectionById.get("J2")!;
    expect(evaluateSubsection(j2, high).gaps.map((g) => g.fieldId)).toContain("J.risk.additional");
    expect(evaluateSubsection(j2, low).gaps.map((g) => g.fieldId)).not.toContain("J.risk.additional");
  });
});

describe("answer states and completeness", () => {
  it("an empty assessment is 0% complete with applicable fields counted", () => {
    const res = evaluateAssessment(buildModel([], []));
    expect(res.required).toBeGreaterThan(30);
    expect(res.complete).toBe(0);
    expect(res.percent).toBe(0);
  });

  it("'Not sure' and 'Complete later' stay unresolved and never equal No", () => {
    const q = def("C.q3");
    const ctx = buildModel([], []).ctx;
    expect(fieldStatus(q, { value: "NO", state: "NOT_SURE" }, ctx, "")).toBe("UNRESOLVED_NOT_SURE");
    expect(fieldStatus(q, { value: undefined, state: "COMPLETE_LATER" }, ctx, "")).toBe("UNRESOLVED_LATER");
    expect(fieldStatus(q, { value: "NO", state: "ANSWERED" }, ctx, "")).toBe("COMPLETE");
    const res = evaluateSubsection(
      subsectionById.get("C3")!,
      buildModel([r("C.q3", undefined, "NOT_SURE")], []),
    );
    expect(res.unresolved).toBe(1);
    expect(res.complete).toBe(0);
  });

  it("'Not applicable' counts only where allowed and with a rationale", () => {
    const ctx = buildModel([], []).ctx;
    const status = def("H.r.withdraw.status");
    expect(fieldStatus(status, { value: undefined, state: "NOT_APPLICABLE" }, ctx, "")).toBe("INCOMPLETE");
    expect(fieldStatus(status, { value: undefined, state: "NOT_APPLICABLE", rationale: "No consent used" }, ctx, "")).toBe("NOT_APPLICABLE");
    const q = def("C.q1"); // N/A not allowed here
    expect(fieldStatus(q, { value: undefined, state: "NOT_APPLICABLE", rationale: "x" }, ctx, "")).toBe("INCOMPLETE");
  });

  it("marking the rights row not applicable hides its measures field but keeps the value", () => {
    const rows = [
      r("H.r.withdraw", "Withdrawal in settings"),
      r("H.r.withdraw.status", undefined, "NOT_APPLICABLE", "", "Consent not used"),
    ];
    const res = evaluateSubsection(subsectionById.get("H5")!, buildModel(rows, []));
    expect(res.gaps.some((g) => g.fieldId === "H.r.withdraw")).toBe(false);
  });

  it("requires at least one controller and counts it", () => {
    const empty = evaluateSubsection(subsectionById.get("B1")!, buildModel([], []));
    expect(empty.gaps.some((g) => g.fieldId === "B.ctrl")).toBe(true);
    const recs: RecordRow[] = [{ id: "c1", collection: "B.ctrl", ordering: 0 }];
    const one = evaluateSubsection(subsectionById.get("B1")!, buildModel([], recs));
    expect(one.gaps.some((g) => g.fieldId === "B.ctrl")).toBe(false);
  });

  it("'No joint controllers' is complete when ticked or a joint controller exists", () => {
    const tick = buildModel([r("B.ctrl.noJoint", true)], []);
    expect(fieldStatus(def("B.ctrl.noJoint"), tick.ctx.get("B.ctrl.noJoint", ""), tick.ctx, "")).toBe("COMPLETE");
    const recs: RecordRow[] = [{ id: "c1", collection: "B.ctrl", ordering: 0 }];
    const joint = buildModel([r("B.ctrl.kind", "JOINT", "ANSWERED", "c1")], recs);
    expect(fieldStatus(def("B.ctrl.noJoint"), undefined, joint.ctx, "")).toBe("COMPLETE");
  });

  it("workflow-owned and computed fields are never counted for the owner", () => {
    const c9 = evaluateSubsection(subsectionById.get("C9")!, buildModel([], []));
    expect(c9.required).toBe(0);
    const k4 = evaluateSubsection(subsectionById.get("K4")!, buildModel([], []));
    expect(k4.required).toBe(0);
  });
});

describe("CD-24 inverted Yes in necessity question 2", () => {
  const q2 = def("I.nec.q2");
  it("keeps the original source wording and stores Yes/No exactly as chosen", () => {
    expect(q2.label).toBe("Could the same purpose be achieved in a way that interferes less with individuals’ privacy?");
    expect(q2.type).toBe("yesno");
    expect(validateValue(q2, "YES")).toBeNull();
    expect(validateValue(q2, "NO")).toBeNull();
  });
  it("declares that Yes is a concern signal and explains it", () => {
    expect(q2.yesMeaning).toBe("concern");
    expect(q2.yesMeaningText).toMatch(/less intrusive way DOES exist/);
  });
  it("interprets Yes as weighing against necessity and No as supporting it, without changing the value", () => {
    expect(interpretYesNo(q2, "YES")).toBe("WEIGHS_AGAINST");
    expect(interpretYesNo(q2, "NO")).toBe("SUPPORTS");
    expect(interpretYesNo(def("I.nec.q1"), "YES")).toBe("SUPPORTS");
    expect(interpretYesNo(def("I.nec.q1"), "NO")).toBe("WEIGHS_AGAINST");
    expect(interpretYesNo(q2, undefined)).toBe("UNRESOLVED");
  });
  it("only I.nec.q2 is a concern-direction question", () => {
    const concerns = [...fieldIndex.values()].filter((l) => l.def.yesMeaning === "concern").map((l) => l.def.id);
    expect(concerns).toEqual(["I.nec.q2"]);
  });
});

describe("risk calculation (rules RISK-SCORE and RISK-CAT)", () => {
  it("multiplies probability by impact and categorises", () => {
    expect(riskScore(3, 2)).toBe(6);
    expect(riskScore("4", "4")).toBe(16);
    expect(riskCategory(4)).toBe("LOW");
    expect(riskCategory(5)).toBe("MEDIUM");
    expect(riskCategory(8)).toBe("MEDIUM");
    expect(riskCategory(9)).toBe("HIGH");
    expect(riskCategory(16)).toBe("HIGH");
  });
  it("shows missing scores as Not assessed, never zero", () => {
    expect(riskScore(undefined, 3)).toBeNull();
    expect(riskScore(3, 0)).toBeNull();
    expect(riskScore("", "")).toBeNull();
    expect(describeRisk(null, 4)).toBe("Not assessed");
    expect(describeRisk(2, 4)).toBe("8 MEDIUM");
  });
  it("matches the source worked examples", () => {
    expect(describeRisk(3, 2)).toBe("6 MEDIUM");
    expect(describeRisk(2, 2)).toBe("4 LOW");
    expect(describeRisk(3, 4)).toBe("12 HIGH");
    expect(describeRisk(4, 4)).toBe("16 HIGH");
  });
  it("keeps target risk separate from current residual risk (distinct fields)", () => {
    expect(def("J.risk.target").computed).toBe("targetScore");
    expect(def("J.risk.res.score").computed).toBe("residualScore");
    expect(def("J.risk.target.p").optional).toBe(true);
  });
});

describe("validation", () => {
  it("accepts empty values and validates formats", () => {
    expect(validateValue(def("D.launchDate"), "")).toBeNull();
    expect(validateValue(def("D.launchDate"), "2027-02-30")).not.toBeNull();
    expect(validateValue(def("D.launchDate"), "2027-02-28")).toBeNull();
    expect(validateValue(def("C.inputs.population"), { min: 5, max: 3 })).not.toBeNull();
    expect(validateValue(def("C.inputs.population"), { min: 5000, max: 8000 })).toBeNull();
    expect(validateValue(def("C.inputs.population"), { min: -1, max: 3 })).not.toBeNull();
    expect(validateValue(def("A.previousRef"), "https://ex ample")).not.toBeNull();
    expect(validateValue(def("A.previousRef"), "Word assessment 2022")).toBeNull();
    expect(validateValue(def("E.purpose.basis"), ["a", "z"])).not.toBeNull();
    expect(validateValue(def("E.purpose.basis"), ["a", "f"])).toBeNull();
    expect(validateValue(def("J.risk.inh.p"), "5")).not.toBeNull();
    expect(validateValue(def("J.risk.owner"), { userId: "u", text: "x" })).not.toBeNull();
    expect(validateValue(def("J.risk.owner"), { text: "Head of Treasury" })).toBeNull();
    expect(validateValue(def("J.risk.inh.score"), "6")).not.toBeNull();
  });
  it("treats whitespace-only and empty arrays as empty", () => {
    expect(isEmptyValue({ type: "longtext" }, "  ")).toBe(true);
    expect(isEmptyValue({ type: "multi" }, [])).toBe(true);
    expect(isEmptyValue({ type: "yesno" }, "NO")).toBe(false);
  });
  it("flags vague data categories deterministically", () => {
    expect(isVagueCategory("Customer data")).toBe(true);
    expect(isVagueCategory("  contact   details ")).toBe(true);
    expect(isVagueCategory("Email address")).toBe(false);
  });
});

describe("optimistic concurrency decision", () => {
  it("writes when the base revision matches and conflicts otherwise", () => {
    expect(decideRevision(0, undefined)).toBe("write");
    expect(decideRevision(3, 3)).toBe("write");
    expect(decideRevision(3, 4)).toBe("conflict");
    expect(decideRevision(0, 1)).toBe("conflict");
    expect(decideRevision(2, undefined)).toBe("conflict");
  });
});
