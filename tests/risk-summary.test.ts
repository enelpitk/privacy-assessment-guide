import { describe, expect, it } from "vitest";
import { buildModel, evaluateAssessment, evaluateSubsection, type RecordRow, type RespRow } from "@/domain/model";
import { openQuestions } from "@/domain/openQuestions";
import { buildRisks, consultationPrompt, matrixCells } from "@/domain/riskSummary";
import { subsectionById } from "@/content";

const r = (fieldId: string, value: unknown, recordId = "", state: RespRow["state"] = "ANSWERED", rationale?: string): RespRow => ({
  fieldId, recordId, value, state, rationale,
});
const TODAY = new Date("2026-11-07T12:00:00Z");

function model(rows: RespRow[], recs: RecordRow[]) {
  return buildModel(rows, recs);
}
const risk = (id: string, ordering = 0): RecordRow => ({ id, collection: "J.risk", ordering });
const measure = (id: string, parentId: string, ordering = 0): RecordRow => ({ id, collection: "J.risk.measure", parentId, ordering });

describe("risk calculations in the register view", () => {
  it("calculates inherent, current residual and optional target risk separately", () => {
    const rows = [
      r("J.risk.inh.p", "3", "k1"), r("J.risk.inh.i", "4", "k1"),
      r("J.risk.res.p", "2", "k1"), r("J.risk.res.i", "4", "k1"),
      r("J.risk.target.p", "1", "k1"), r("J.risk.target.i", "2", "k1"),
    ];
    const [k] = buildRisks(model(rows, [risk("k1")]), TODAY);
    expect(k.inherent).toMatchObject({ score: 12, category: "HIGH" });
    expect(k.residual).toMatchObject({ score: 8, category: "MEDIUM" });
    expect(k.target).toMatchObject({ score: 2, category: "LOW" });
  });
  it("shows missing scores as not assessed (null), never zero", () => {
    const [k] = buildRisks(model([r("J.risk.inh.p", "3", "k1")], [risk("k1")]), TODAY);
    expect(k.inherent).toBeNull();
    expect(k.residual).toBeNull();
    expect(k.target).toBeNull();
    expect(k.flags.join(" ")).toContain("Not assessed");
  });
  it("target risk never replaces current residual risk", () => {
    const rows = [r("J.risk.res.p", "4", "k1"), r("J.risk.res.i", "4", "k1"), r("J.risk.target.p", "1", "k1"), r("J.risk.target.i", "1", "k1")];
    const [k] = buildRisks(model(rows, [risk("k1")]), TODAY);
    expect(k.residual?.score).toBe(16);
    expect(k.target?.score).toBe(1);
    expect(consultationPrompt([k])).toHaveLength(1); // driven by current residual, not the planned target
  });
  it("prompts about consultation only from CURRENT RESIDUAL HIGH, not an inherent HIGH", () => {
    const inherentHigh = [r("J.risk.inh.p", "4", "k1"), r("J.risk.inh.i", "4", "k1"), r("J.risk.res.p", "2", "k1"), r("J.risk.res.i", "2", "k1")];
    expect(consultationPrompt(buildRisks(model(inherentHigh, [risk("k1")]), TODAY))).toHaveLength(0);
    const residualHigh = [r("J.risk.res.p", "3", "k1"), r("J.risk.res.i", "3", "k1")];
    expect(consultationPrompt(buildRisks(model(residualHigh, [risk("k1")]), TODAY))).toHaveLength(1);
  });
  it("warns when current residual is lower than inherent without a completed measure", () => {
    const rows = [r("J.risk.inh.p", "4", "k1"), r("J.risk.inh.i", "4", "k1"), r("J.risk.res.p", "2", "k1"), r("J.risk.res.i", "2", "k1"), r("J.risk.status", "IN_PROGRESS", "m1")];
    const [k] = buildRisks(model(rows, [risk("k1"), measure("m1", "k1")]), TODAY);
    expect(k.flags.join(" ")).toContain("no measure is marked Completed");
    const done = [...rows.filter((x) => x.fieldId !== "J.risk.status"), r("J.risk.status", "COMPLETED", "m1")];
    const [k2] = buildRisks(model(done, [risk("k1"), measure("m1", "k1")]), TODAY);
    expect(k2.flags.join(" ")).not.toContain("no measure is marked Completed");
  });
  it("marks open measures past their due date as overdue, without changing any score", () => {
    const rows = [
      r("J.risk.res.p", "2", "k1"), r("J.risk.res.i", "2", "k1"),
      r("J.risk.due", "2026-10-01", "m1"), r("J.risk.status", "IN_PROGRESS", "m1"),
      r("J.risk.due", "2026-10-01", "m2"), r("J.risk.status", "COMPLETED", "m2"),
      r("J.risk.due", "2027-01-01", "m3"),
    ];
    const [k] = buildRisks(model(rows, [risk("k1"), measure("m1", "k1", 0), measure("m2", "k1", 1), measure("m3", "k1", 2)]), TODAY);
    expect(k.measures.map((m) => m.overdue)).toEqual([true, false, false]);
    expect(k.residual?.score).toBe(4);
  });
  it("plots only assessed risks, in the chosen matrix", () => {
    const rows = [
      r("J.risk.inh.p", "4", "k1"), r("J.risk.inh.i", "4", "k1"),
      r("J.risk.res.p", "2", "k1"), r("J.risk.res.i", "3", "k1"),
      r("J.risk.inh.p", "1", "k2"),
    ];
    const risks = buildRisks(model(rows, [risk("k1", 0), risk("k2", 1)]), TODAY);
    expect(matrixCells(risks, "inherent").get("4,4")?.map((x) => x.number)).toEqual([1]);
    expect(matrixCells(risks, "residual").get("2,3")?.map((x) => x.number)).toEqual([1]);
    expect(matrixCells(risks, "target").size).toBe(0);
    expect([...matrixCells(risks, "inherent").values()].flat()).toHaveLength(1); // k2 not assessed, not plotted
  });
});

describe("risk examples must be adapted and confirmed", () => {
  it("a risk started from an example is incomplete until confirmed", () => {
    const rows = [r("J.risk.name", "Processing without legal basis", "k1"), r("J.risk.fromExample", "ex1", "k1")];
    const open = evaluateSubsection(subsectionById.get("J2")!, model(rows, [risk("k1")]));
    expect(open.gaps.map((g) => g.fieldId)).toContain("J.risk.confirmed");
    const done = evaluateSubsection(subsectionById.get("J2")!, model([...rows, r("J.risk.confirmed", true, "k1")], [risk("k1")]));
    expect(done.gaps.map((g) => g.fieldId)).not.toContain("J.risk.confirmed");
  });
  it("a manually added risk has no confirmation requirement", () => {
    const res = evaluateSubsection(subsectionById.get("J2")!, model([r("J.risk.name", "Mine", "k1")], [risk("k1")]));
    expect(res.gaps.map((g) => g.fieldId)).not.toContain("J.risk.confirmed");
  });
  it("high current residual risk requires additional actions and a specialist review", () => {
    const rows = [r("J.risk.res.p", "4", "k1"), r("J.risk.res.i", "3", "k1")];
    const ids = evaluateSubsection(subsectionById.get("J2")!, model(rows, [risk("k1")])).gaps.map((g) => g.fieldId);
    expect(ids).toContain("J.risk.additional");
    expect(ids).toContain("J.risk.specialist");
  });
});

describe("open questions summary", () => {
  it("lists unresolved items with the user's note, and counts incomplete items separately", () => {
    const rows = [
      r("C.q3", undefined, "", "NOT_SURE", "Is facial matching new for us?"),
      r("C.q4", undefined, "", "COMPLETE_LATER"),
      r("B2.help", true, "", "ANSWERED", "Hosting arrangement unclear"),
    ];
    const res = evaluateAssessment(model(rows, []));
    const oq = openQuestions(res);
    const kinds = oq.unresolved.map((u) => [u.fieldId, u.kind]);
    expect(kinds).toContainEqual(["C.q3", "NOT_SURE"]);
    expect(kinds).toContainEqual(["C.q4", "COMPLETE_LATER"]);
    expect(kinds).toContainEqual(["B2.help", "HELP_REQUEST"]);
    expect(oq.unresolved.find((u) => u.fieldId === "C.q3")!.note).toBe("Is facial matching new for us?");
    expect(oq.incompleteTotal).toBeGreaterThan(20);
    expect(oq.incompleteBySubsection.length).toBeGreaterThan(5);
  });
  it("excludes inactive sections and cleared help requests", () => {
    const rows = [r("F.applies", "NO"), r("B2.help", false)];
    const oq = openQuestions(evaluateAssessment(model(rows, [])));
    expect(oq.incompleteBySubsection.map((x) => x.subsection.id)).not.toContain("F2");
    expect(oq.unresolved.map((u) => u.fieldId)).not.toContain("B2.help");
  });
});
