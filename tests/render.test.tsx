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

describe("progressive disclosure", () => {
  it("shows the real identifier and owner compactly, never 'Pending' for them", () => {
    const html = render("A1", pageStub());
    expect(html).toContain("DPIA-2026-0001");
    expect(html).toContain("Alex Rowan");
    expect(html).not.toMatch(/Assessment identifier[^<]*<\/span><strong>[^<]*<\/strong>[\s\S]{0,200}Pending/);
    expect(html).not.toContain("Generated automatically");
  });

  it("moves guidance, examples and original wording behind a labelled control, but keeps them in the page", () => {
    const html = render("A1", pageStub());
    expect(html).toContain("Guidance");
    expect(html).toMatch(/<details[^>]*>(?:(?!<\/details>)[\s\S])*Example \(guidance, not your answer\)(?:(?!<\/details>)[\s\S])*<\/details>/);
    expect(html).toContain("What should my answer include?");
    expect(html).toContain("About this section");
    // the short inline hint for the name field is inside the control, not in the visible form
    const visible = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(html).toContain("A short, recognisable name");
    expect(visible).not.toContain("A short, recognisable name");
  });

  it("keeps essential qualifications visible outside the guidance control", () => {
    const html = render("A2", pageStub());
    const visible = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(visible).toContain("Select all that apply.");
  });

  it("does not repeat the subsection description under the heading", () => {
    const html = render("A2", pageStub());
    const visible = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(visible).not.toContain("Why a DPIA is being done and what has changed, if anything.");
  });

  it("replaces the permanent status dropdown with an 'Answer options' control", () => {
    const html = render("C3", pageStub());
    expect(html).not.toContain("Answer normally");
    expect(html).not.toContain("Answer status");
    expect(html).toContain("Answer options");
  });

  it("keeps a selected 'Not sure' state visible and changeable", () => {
    const page = pageStub({
      fields: { "C.q3|": { value: null, state: "NOT_SURE", rationale: null, revision: 1, editorName: "Alex Rowan", lastEditedAt: "2026-11-07T10:00:00.000Z" } },
    });
    const html = render("C3", page);
    const visible = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(visible).toContain("Not sure — I need help");
    expect(visible).toContain("unresolved, not “No”");
    expect(html).toContain("Answer options");
  });

  it("puts routine edit details behind 'Edit details' and shows no routine per-field save chip", () => {
    const page = pageStub({
      fields: { "A.description|": { value: "x", state: "ANSWERED", rationale: null, revision: 2, editorName: "Priya Nandi", lastEditedAt: "2026-11-07T10:00:00.000Z" } },
    });
    const html = render("A1", page).replace(/<!-- -->/g, "");
    const visible = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(html).toContain("Edit details");
    expect(html).toContain("Last edited by Priya Nandi");
    expect(visible).not.toContain("Last edited by");
    expect(visible).not.toContain("Nothing saved yet");
  });

  it("shows the pending note once per subsection, not on every pending field", () => {
    const html = render("C9", pageStub());
    expect(html.match(/<strong>Pending:<\/strong>/g)).toHaveLength(1);
  });
});
