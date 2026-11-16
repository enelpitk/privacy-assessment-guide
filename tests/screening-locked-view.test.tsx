import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CollabProvider } from "@/components/form/collab";
import { StoreCtx } from "@/components/form/context";
import { AssessmentStore } from "@/components/form/store";
import { SubsectionForm } from "@/components/form/SubsectionForm";
import { subsectionById } from "@/content";
import { SCREENING_LOCK_REASON, canEditField, isScreeningLock } from "@/domain/permissions";
import type { AccessCtx } from "@/domain/permissions";
import type { PageData } from "@/lib/types";
import { pageStub } from "./helpers";

type Who = "owner" | "dpo" | "assignee" | "stranger";

function page(who: Who, ctx: Partial<AccessCtx>): PageData {
  const base = pageStub();
  const actor = { owner: { id: "o1", roles: ["OWNER"] }, dpo: { id: "d1", roles: ["DPO"] }, assignee: { id: "c1", roles: ["CONTRIBUTOR"] }, stranger: { id: "c2", roles: ["CONTRIBUTOR"] } }[who] as PageData["actor"];
  const c = { ...base.ctx, ...ctx, assignedSubsections: who === "assignee" ? ["C1", "B1", "A1"] : [], isAssignee: who === "assignee" };
  return { ...base, actor, ctx: c, assessment: { ...base.assessment, lifecycle: c.lifecycle, screeningStatus: c.screeningStatus } };
}

function html(sub: string, p: PageData) {
  const store = new AssessmentStore(p);
  return renderToString(
    <StoreCtx.Provider value={{ store, page: p, navigate: async () => undefined }}>
      <CollabProvider page={p}>
        <SubsectionForm subsectionId={sub} />
      </CollabProvider>
    </StoreCtx.Provider>,
  ).replace(/<!-- -->/g, "");
}

const hasQuestionComment = (h: string) => />Comment</.test(h);
const hasSectionComments = (h: string) => h.includes("Comments on this section");
const thread = {
  id: "t1",
  subsectionId: "C1",
  fieldId: null,
  recordId: null,
  state: "OPEN" as const,
  comments: [{ id: "c1", authorName: "Dana Whitfield", authorId: "d1", body: "A review comment.", createdAt: "2026-11-08T10:00:00.000Z", parentId: null, isReview: true }],
};
const submitted = { lifecycle: "DRAFT" as const, screeningStatus: "AWAITING_DPO" as const };

describe("submitted screening view: comment links and lock messages are hidden", () => {
  for (const status of ["AWAITING_DPO", "DECIDED"] as const) {
    for (const sub of ["A1", "C1", "C2", "B1"]) {
      it(`owner, ${status}, section ${sub}: no comment links, no read-only line, no lock notice; answers stay visible and disabled`, () => {
        const h = html(sub, page("owner", { lifecycle: "DRAFT", screeningStatus: status }));
        expect(hasQuestionComment(h)).toBe(false);
        expect(hasSectionComments(h)).toBe(false);
        expect(h).not.toContain("Read-only:");
        expect(h).not.toContain(SCREENING_LOCK_REASON);
        expect(h).not.toContain("You can read this section but not edit it");
        expect(h).toMatch(/disabled/); // access control unchanged: controls remain disabled
      });
    }
  }
  it("the answer controls are still rendered (answers stay visible) and stay disabled", () => {
    const h = html("C1", page("owner", submitted));
    expect(h).toContain("Will the processing involve special category data");
    expect(h).toMatch(/<input[^>]*type="radio"[^>]*disabled/);
  });
  it("an assigned contributor sees the same plain view while the screening is locked", () => {
    const h = html("C1", page("assignee", submitted));
    expect(hasQuestionComment(h)).toBe(false);
    expect(hasSectionComments(h)).toBe(false);
    expect(h).not.toContain("Read-only:");
  });
});

describe("other states keep their read-only messages (the questionnaire shows no comment blocks in any of them)", () => {
  it("before the screening is submitted the owner can edit and no read-only line is shown", () => {
    const h = html("C1", page("owner", { lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED" }));
    expect(h).not.toContain("Read-only:");
    expect(hasSectionComments(h)).toBe(false);
  });
  it("sections after the screening (4 to 11) stay editable while the screening awaits the DPO", () => {
    const h = html("D1", page("owner", submitted));
    expect(h).not.toContain("Read-only:");
  });
  it("the DPO keeps the 'DPOs read and comment' message on submitted screening sections", () => {
    const h = html("C1", page("dpo", submitted));
    expect(h).toContain("DPO users read and comment");
  });
  it("a contributor assigned elsewhere keeps the assignment message on a screening section not assigned to them", () => {
    const p = page("assignee", submitted);
    const other = { ...p, ctx: { ...p.ctx, assignedSubsections: ["D1"] } };
    expect(html("C1", other)).toContain("You can edit only subsections assigned to you.");
  });
  it("during the DPO review the owner still sees the review-state lock message", () => {
    const h = html("C1", page("owner", { lifecycle: "IN_DPO_REVIEW", screeningStatus: "DECIDED" }));
    expect(h).toContain("Substantive editing is locked in the current review state.");
  });
  it("an archived assessment still shows its read-only message", () => {
    const h = html("C1", page("owner", { lifecycle: "ARCHIVED", screeningStatus: "DECIDED" }));
    expect(h).toContain("Archived assessments are read-only.");
  });
});

describe("the permission rule itself is unchanged", () => {
  it("still refuses owner edits to submitted screening sections with the same reason, and isScreeningLock matches only that reason", () => {
    const owner = { id: "o1", roles: ["OWNER" as const] };
    const ctx: AccessCtx = { ...pageStub().ctx, ...submitted };
    const d = canEditField(owner, ctx, { id: "x", changeClass: "SUBSTANTIVE" }, "C1");
    expect(d).toEqual({ ok: false, reason: SCREENING_LOCK_REASON });
    expect(isScreeningLock(d)).toBe(true);
    expect(isScreeningLock({ ok: true })).toBe(false);
    expect(isScreeningLock({ ok: false, reason: "Archived assessments are read-only." })).toBe(false);
    expect(canEditField(owner, ctx, { id: "x", changeClass: "SUBSTANTIVE" }, "D1")).toEqual({ ok: true });
  });
});

describe("owner-only hint: how to change locked screening answers", () => {
  const hint = (h: string) => h.includes('data-testid="withdraw-hint"');

  it("the owner sees a short hint with a link to Review and decisions while the screening is with the DPO", () => {
    const h = html("C1", page("owner", submitted));
    expect(hint(h)).toBe(true);
    expect(h).toContain("The screening is with the DPO. To change these answers, withdraw it for editing on");
    expect(h).toMatch(/<a[^>]*href="\/assessments\/a1\/review"[^>]*>Review and decisions<\/a>/);
    // the generic lock notice stays removed
    expect(h).not.toContain(SCREENING_LOCK_REASON);
    expect(h).not.toContain("You can read this section but not edit it");
    expect(h).not.toContain("Read-only:");
  });
  it("it appears in other submitted screening sections too (1.1, 2.1, 3.2)", () => {
    for (const sub of ["A1", "B1", "C1"]) expect(hint(html(sub, page("owner", submitted))), sub).toBe(true);
  });
  it("it is not shown to the DPO or to an assigned contributor", () => {
    expect(hint(html("C1", page("dpo", submitted)))).toBe(false);
    expect(hint(html("C1", page("assignee", submitted)))).toBe(false);
  });
  it("it is not shown when withdrawal is unavailable: decided, not submitted, archived, or sections after the screening", () => {
    expect(hint(html("C1", page("owner", { lifecycle: "DRAFT", screeningStatus: "DECIDED" })))).toBe(false);
    expect(hint(html("C1", page("owner", { lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED" })))).toBe(false);
    expect(hint(html("C1", page("owner", { lifecycle: "ARCHIVED", screeningStatus: "AWAITING_DPO" })))).toBe(false);
    expect(hint(html("D1", page("owner", submitted)))).toBe(false);
  });
});

describe("the questionnaire shows no comment UI (display only); the help request keeps its own thread link", () => {
  const thread = {
    id: "t1",
    subsectionId: "A1",
    fieldId: null,
    recordId: null,
    state: "OPEN" as const,
    comments: [{ id: "c1", authorName: "Dana Whitfield", authorId: "d1", body: "A comment.", createdAt: "2026-11-08T10:00:00.000Z", parentId: null, isReview: true }],
  };
  const ctx = { lifecycle: "DRAFT" as const, screeningStatus: "NOT_SUBMITTED" as const };
  // Sections without a "Not sure - I need help" request show no Comment links at all.
  const SAMPLE = ["A1", "A2", "C0", "C1", "C2", "C5", "D1", "E1", "F1", "G1", "H1", "I1", "J1", "J2", "K2", "K3", "K7"];

  it("the sampled section ids are real sections (so the checks below are not vacuous)", () => {
    for (const sub of SAMPLE) expect(subsectionById.has(sub), sub).toBe(true);
  });
  it("no per-field 'Comment' link and no 'Comments on this section' block appears in any sampled section for the owner, the DPO or a contributor", () => {
    for (const sub of SAMPLE) {
      for (const who of ["owner", "dpo", "assignee"] as const) {
        const h = html(sub, page(who, ctx));
        expect(hasQuestionComment(h), `${sub} ${who}`).toBe(false);
        expect(hasSectionComments(h), `${sub} ${who}`).toBe(false);
      }
    }
  });
  it("the answers stay visible in those sections", () => {
    expect(html("A1", page("owner", ctx))).toContain("Name of the processing");
    expect(html("A2", page("owner", ctx))).toContain("Reason for the DPIA");
  });
  it("stored comment threads are not deleted or altered: they remain in the page data, only the UI is not shown", () => {
    const p = { ...page("dpo", ctx), threads: [thread] };
    const h = html("A1", p);
    expect(hasSectionComments(h)).toBe(false);
    expect(h).not.toContain("Comments on this section (1");
    expect(p.threads).toHaveLength(1);
  });
  it("sections with a 'Not sure - I need help' request keep that request and its own thread link (2.1 and 2.2)", () => {
    for (const sub of ["B1", "B2"]) {
      const h = html(sub, page("owner", ctx));
      expect(h, sub).toContain("Not sure – I need help");
      expect(hasSectionComments(h), sub).toBe(false);
      expect((h.match(/>Comment</g) ?? []).length, sub).toBe(1); // only the help request's thread link
    }
  });
});
