import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SUBSECTIONS, collectionIndex } from "@/content";
import { StoreCtx } from "@/components/form/context";
import { AssessmentStore } from "@/components/form/store";
import { SubsectionForm } from "@/components/form/SubsectionForm";
import { pageStub } from "./helpers";
import type { PageData } from "@/lib/types";

function render(sub: string, page: PageData) {
  const store = new AssessmentStore(page);
  return renderToString(
    <StoreCtx.Provider value={{ store, page, navigate: async () => undefined }}>
      <SubsectionForm subsectionId={sub} />
    </StoreCtx.Provider>,
  );
}

/** One record in every top-level collection, so repeatable cards are rendered too. */
function pageWithRecords(): PageData {
  const records: PageData["records"] = [];
  let n = 0;
  for (const [id, loc] of collectionIndex) {
    if (loc.parent) continue;
    records.push({ id: `r${n++}`, collection: id, parentId: null, ordering: 0, revision: 1 });
  }
  for (const [id, loc] of collectionIndex) {
    if (!loc.parent) continue;
    const parent = records.find((r) => r.collection === loc.parent);
    if (parent) records.push({ id: `r${n++}`, collection: id, parentId: parent.id, ordering: 0, revision: 1 });
  }
  return pageStub({
    records,
    fields: {
      "F.applies|": { value: "YES", state: "ANSWERED", rationale: null, revision: 1, editorName: "Alex Rowan", lastEditedAt: "2026-11-07T10:00:00.000Z" },
      "E.sc.applies|": { value: "YES", state: "ANSWERED", rationale: null, revision: 1, editorName: "Alex Rowan", lastEditedAt: "2026-11-07T10:00:00.000Z" },
      "E.sec.applies|": { value: "YES", state: "ANSWERED", rationale: null, revision: 1, editorName: "Alex Rowan", lastEditedAt: "2026-11-07T10:00:00.000Z" },
      "G.external.status|": { value: "YES", state: "ANSWERED", rationale: null, revision: 1, editorName: "Alex Rowan", lastEditedAt: "2026-11-07T10:00:00.000Z" },
    },
  });
}

describe("render smoke test: every subsection renders", () => {
  it("renders all subsections on an empty assessment", () => {
    for (const sub of SUBSECTIONS) {
      const html = render(sub.id, pageStub());
      expect(html, sub.id).toContain(sub.title);
    }
  });

  it("renders all subsections with repeatable records present", () => {
    for (const sub of SUBSECTIONS) {
      const html = render(sub.id, pageWithRecords());
      expect(html, sub.id).toContain(sub.title);
    }
  });

  it("renders as read-only for a DPO (no edit controls for owner answers)", () => {
    const page = pageStub({ actor: { id: "d1", roles: ["DPO"] } });
    const html = render("A1", page);
    expect(html).toContain("You can read this section but not edit it");
    expect(html).toMatch(/disabled=""/);
  });

  it("shows no red validation errors on an empty form", () => {
    const html = render("A2", pageStub());
    expect(html).not.toContain('role="alert"');
  });

  it("states what is pending rather than implying it works", () => {
    expect(render("C8", pageStub())).toContain("Coming in Stage 3");
    expect(render("C9", pageStub())).toContain("Pending:");
    expect(render("K4", pageStub())).toContain("Pending:");
  });

  it("shows the original question and the inverted-Yes explanation for necessity question 2", () => {
    const html = render("I1", pageStub());
    expect(html).toContain("Could the same purpose be achieved in a way that interferes less with individuals’ privacy?");
    expect(html).toContain("a less intrusive way DOES exist");
  });
});
