import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SUBSECTIONS, collectionIndex } from "@/content";
import { StoreCtx } from "@/components/form/context";
import { CollabProvider } from "@/components/form/collab";
import { AssessmentStore } from "@/components/form/store";
import { SubsectionForm } from "@/components/form/SubsectionForm";
import { pageStub } from "./helpers";
import type { PageData } from "@/lib/types";

function render(sub: string, page: PageData) {
  const store = new AssessmentStore(page);
  return renderToString(
    <StoreCtx.Provider value={{ store, page, navigate: async () => undefined }}>
      <CollabProvider page={page}>
        <SubsectionForm subsectionId={sub} />
      </CollabProvider>
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
    expect(render("C8", pageStub())).not.toContain("Coming in Stage 3"); // implemented in Stage 3
    // recorded decisions are now real workflow panels, not placeholders
    for (const sub of ["C9", "K1", "K4"]) {
      const html = render(sub, pageStub());
      expect(html, sub).not.toContain("Pending");
      expect(html, sub).toContain("Loading review status");
    }
  });

  it("shows the original question and the inverted-Yes explanation for necessity question 2", () => {
    const html = render("I1", pageStub());
    expect(html).toContain("Could the same purpose be achieved in a way that interferes less with individuals’ privacy?");
    expect(html).toContain("a less intrusive way DOES exist");
  });
});

describe("progressive disclosure", () => {
  it("hides the assessment identifier in the questionnaire view", () => {
    const html = render("A1", pageStub());
    expect(html).not.toContain("DPIA-2026-0001");
    expect(html).not.toContain("Assessment identifier");
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
    const html = render("E1", pageWithRecords());
    const visible = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(visible).toContain("Select every basis that applies");
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

  it("shows no routine 'Saved' badge or 'Last edited by' text, even when the data exists", () => {
    const page = pageStub({
      fields: { "A.description|": { value: "x", state: "ANSWERED", rationale: null, revision: 2, editorName: "Priya Nandi", lastEditedAt: "2026-11-07T10:00:00.000Z" } },
    });
    const html = render("A1", page).replace(/<!-- -->/g, "");
    expect(html).not.toContain("Last edited by");
    expect(html).not.toContain("Edit details");
    expect(html).not.toContain("Priya Nandi");
    expect(html).not.toContain("Nothing saved yet");
  });

  it("does not render an Owner item in the questionnaire", () => {
    const html = render("A1", pageStub());
    expect(html).not.toContain("process, system or service owner");
    expect(html).not.toContain("Pending");
  });

  it("shows no input controls for recorded decisions inside the questionnaire", () => {
    for (const sub of ["C9", "K1", "K4"]) {
      const html = render(sub, pageStub());
      expect(html, sub).not.toContain("<textarea");
      expect(html, sub).not.toContain('type="radio"');
    }
  });
});

describe("visible numbering", () => {
  it("shows 1-11 and 1.1 style labels, never 'Stage' or letters, in headings and navigation text", () => {
    const html = render("A1", pageStub()).replace(/<!-- -->/g, "");
    expect(html).toContain("1. General information");
    expect(html).toContain("1.1 Processing");
    expect(html).not.toMatch(/Stage [A-K]\b/);
    const c9 = render("C9", pageStub()).replace(/<!-- -->/g, "");
    expect(c9).toContain("3. Pre-assessment");
    expect(c9).toContain("3.10 DPO screening decision");
    expect(c9).not.toContain("C9 ·");
  });
});

describe("1 Processing and Reason: no answer options", () => {
  it("has no Answer options anywhere in 1.1 and 1.2 but keeps the inputs", () => {
    for (const sub of ["A1", "A2"]) {
      const html = render(sub, pageStub());
      expect(html, sub).not.toContain("Answer options");
      expect(html, sub).not.toContain("Complete later");
    }
    expect(render("A1", pageStub())).toContain("Name of the processing");
    expect(render("A1", pageStub())).toContain("General description - brief summary of what the processing involves");
  });
  it("removes 'Select all that apply' and the manual-entry sentence but keeps the previous reference field", () => {
    const html = render("A2", pageStub());
    expect(html).not.toContain("Select all that apply");
    expect(html).not.toContain("Existing assessments are entered manually");
    expect(html).toContain("Previous assessment reference");
    expect(html).toContain("Mandated by law");
  });
});

describe("2.1 Controllers", () => {
  const page = () =>
    pageStub({
      records: [{ id: "c1", collection: "B.ctrl", parentId: null, ordering: 0, revision: 1 }],
      entities: [
        { id: "e1", kind: "PARTY", name: "Harbour Bank", revision: 1 },
        { id: "e2", kind: "PARTY", name: "Legacy Custom Holding", revision: 1 },
      ],
      fields: {
        "B.ctrl.name|c1": { value: "e2", state: "ANSWERED", rationale: null, revision: 1, editorName: "A", lastEditedAt: "2026-11-07T10:00:00.000Z" },
        "B.ctrl.kind|c1": { value: "JOINT", state: "ANSWERED", rationale: null, revision: 1, editorName: "A", lastEditedAt: "2026-11-07T10:00:00.000Z" },
      },
    });

  it("shows a compact controller record with a Select control and roles", () => {
    const html = render("B1", page()).replace(/<!-- -->/g, "");
    expect(html).toContain("Controller 1");
    expect(html).toContain(">Select<");
    expect(html).toContain("Roles and responsibilities");
    expect(html).toContain("+ Add a new Controller");
    expect(html).toContain("Harbour Insurance");
    expect(html).toContain("Harbour Asset Management");
    expect(html).toContain("Harbour Bank");
    expect(html).toContain("Not sure – I need help");
  });
  it("keeps saved custom controller names readable and selected", () => {
    const html = render("B1", page());
    expect(html).toContain("Legacy Custom Holding");
    expect(html).toMatch(/<option[^>]*value="e2"[^>]*selected|<option[^>]*selected[^>]*value="e2"/);
  });
  it("removes the type radios, the no-joint checkbox, top-level guidance and status controls", () => {
    const html = render("B1", page());
    expect(html).not.toContain("There are no joint controllers");
    expect(html).not.toContain("Joint controller");
    expect(html).not.toContain("Answer options");
    expect(html).not.toContain("Complete later");
    expect(html).not.toContain("About this section");
  });
  it("shows the controller guidance once, collapsed, near the Controller heading", () => {
    const two = page();
    two.records.push({ id: "c2", collection: "B.ctrl", parentId: null, ordering: 1, revision: 1 });
    const html = render("B1", two).replace(/<!-- -->/g, "");
    expect((html.match(/>Guidance</g) ?? []).length).toBe(1); // once, not per record
    const m = /<details([^>]*)><summary[^>]*>Guidance<\/summary><p[^>]*>([^<]*)<\/p>/.exec(html);
    expect(m).not.toBeNull();
    expect(m![1]).not.toContain("open"); // collapsed by default
    expect(m![2]).toContain("decides why and how personal data is processed");
    expect(m![2]).toContain("jointly decide");
    expect(m![2]).toContain("respective roles and responsibilities");
    expect(html.indexOf("Guidance")).toBeLessThan(html.indexOf("Controller 1"));
  });
  it("puts the single help request after all controller records and the add control", () => {
    const html = render("B1", page()).replace(/<!-- -->/g, "");
    const help = html.indexOf("Not sure – I need help");
    expect(help).toBeGreaterThan(html.indexOf("+ Add a new Controller"));
    expect(help).toBeGreaterThan(html.indexOf("Roles and responsibilities"));
    expect(help).toBeLessThan(html.indexOf("Save draft"));
    expect(html.match(/Not sure – I need help/g)).toHaveLength(1);
  });
  it("keeps an existing help request, its status and comment", () => {
    const p = page();
    p.fields["B1.help|"] = { value: true, state: "ANSWERED", rationale: "Which entity is joint?", revision: 3, editorName: "A", lastEditedAt: "2026-11-07T10:00:00.000Z" };
    const html = render("B1", p);
    expect(html).toContain("Help requested — unresolved");
    expect(html).toContain("Which entity is joint?");
  });
});

describe("2.2 Processors", () => {
  const page = () =>
    pageStub({
      records: [
        { id: "p1", collection: "B.proc", parentId: null, ordering: 0, revision: 1 },
        { id: "s1", collection: "B.sub", parentId: "p1", ordering: 0, revision: 1 },
      ],
    });

  it("keeps the checkbox, drops the instruction sentence, suggestions and Add buttons", () => {
    const html = render("B2", page());
    expect(html).toContain("No processors are involved");
    expect(html).not.toContain("Tick this if no processor");
    expect(html).not.toContain("Suggestions");
    expect(html).not.toMatch(/Add “/);
    expect(html).not.toContain("Answer options");
    expect(html).not.toContain("Complete later");
  });
  it("presents a grouped record in order with the sub-processor nested under its processor", () => {
    const html = render("B2", page()).replace(/<!-- -->/g, "");
    const i = (t: string) => html.indexOf(t);
    expect(i("Processor name")).toBeGreaterThan(-1);
    expect(i("Processor name")).toBeLessThan(i("Roles and responsibilities"));
    expect(i("Roles and responsibilities")).toBeLessThan(i("Data processing agreement (DPA) reference"));
    expect(i("Data processing agreement (DPA) reference")).toBeLessThan(i("Sub-processor 1"));
    expect(html).toContain("+ Add processor");
    expect(html).toContain("+ Add sub-processor");
    expect(html).toContain("Processor 1");
  });
  it("a help request shows as active but opening the control alone changes nothing", () => {
    const withHelp = pageStub({
      fields: { "B2.help|": { value: true, state: "ANSWERED", rationale: "Unsure about hosting", revision: 1, editorName: "A", lastEditedAt: "2026-11-07T10:00:00.000Z" } },
    });
    const html = render("B2", withHelp);
    expect(html).toContain("Help requested — unresolved");
    expect(html).toContain("Unsure about hosting");
    expect(html).toContain("Clear help request");
    expect(render("B2", pageStub())).not.toContain("Help requested");
  });
  it("keeps an existing unresolved state visible with an explicit way to mark it answered", () => {
    const p = pageStub({
      records: [{ id: "p1", collection: "B.proc", parentId: null, ordering: 0, revision: 1 }],
      fields: { "B.proc.role|p1": { value: "Hosts data", state: "NOT_SURE", rationale: null, revision: 1, editorName: "A", lastEditedAt: "2026-11-07T10:00:00.000Z" } },
    });
    const html = render("B2", p).replace(/<!-- -->/g, "");
    expect(html).toContain("Not sure — I need help — unresolved, not “No”");
    expect(html).toContain("Mark as answered");
  });
});

describe("Stage 3: screening suggestions and outcomes", () => {
  const f = (value: unknown, state = "ANSWERED") => ({ value, state: state as "ANSWERED", rationale: null, revision: 1, editorName: "A", lastEditedAt: "2026-11-07T10:00:00.000Z" });

  it("shows an explainable suggestion that is not applied until the user confirms it", () => {
    const page = pageStub({ fields: { "C.inputs.specialCount|": f({ min: 9000, max: 9000 }) } });
    const html = render("C1", page).replace(/<!-- -->/g, "");
    expect(html).toContain("Suggested answer:");
    expect(html).toContain("9,000 individuals with special category or criminal data");
    expect(html).toContain("Use this suggestion: Yes");
    expect(html).not.toContain("You have confirmed this suggestion");
  });

  it("shows the per-sub-question result table for question 5", () => {
    const html = render("C5", pageStub()).replace(/<!-- -->/g, "");
    expect(html).toContain("Question 5 – result for each sub-question");
    expect(html).toContain("5.6 Real-time tracking of location or movement");
    expect(html).toContain("Numbers are never added together");
  });

  it("shows 'Full DPIA indicated — awaiting DPO review' and the independent TIA indication", () => {
    const page = pageStub({ fields: { "C.q1|": f("YES"), "C.q7|": f("YES"), "C.q2|": f(undefined, "NOT_SURE") } });
    const html = render("C8", page).replace(/<!-- -->/g, "");
    expect(html).toContain("Full DPIA indicated — awaiting DPO review");
    expect(html).toContain("TIA follow-up indicated");
    expect(html).toContain("Unresolved screening questions");
    expect(html).toContain("marked “Not sure – I need help”");
  });

  it("question 7 alone indicates a TIA but not a full DPIA", () => {
    const html = render("C8", pageStub({ fields: { "C.q7|": f("YES") } })).replace(/<!-- -->/g, "");
    expect(html).toContain("TIA follow-up indicated");
    expect(html).not.toContain("Full DPIA indicated");
    expect(html).toContain("No confirmed indication yet");
  });

  it("explains the Q6 ambiguity for the DPO", () => {
    const page = pageStub({ fields: { "C.inputs.population|": f({ min: 60000, max: 60000 }), "C.q1|": f("YES") } });
    const html = render("C6", page).replace(/<!-- -->/g, "");
    expect(html).toContain("For DPO review");
    expect(html).toContain("different people or different data");
  });
});

describe("Stage 3: risk register", () => {
  const f = (value: unknown) => ({ value, state: "ANSWERED" as const, rationale: null, revision: 1, editorName: "A", lastEditedAt: "2026-11-07T10:00:00.000Z" });
  const page = () =>
    pageStub({
      records: [
        { id: "k1", collection: "J.risk", parentId: null, ordering: 0, revision: 1 },
        { id: "m1", collection: "J.risk.measure", parentId: "k1", ordering: 0, revision: 1 },
      ],
      fields: {
        "J.risk.name|k1": f("Unauthorised access"),
        "J.risk.inh.p|k1": f("3"), "J.risk.inh.i|k1": f("4"),
        "J.risk.res.p|k1": f("3"), "J.risk.res.i|k1": f("3"),
        "J.risk.due|m1": f("2020-01-01"), "J.risk.status|m1": f("IN_PROGRESS"),
      },
    });

  it("shows a readable register, labelled matrix, calculated scores and Not assessed", () => {
    const html = render("J2", page()).replace(/<!-- -->/g, "");
    expect(html).toContain("Risk register");
    expect(html).toContain("R1");
    expect(html).toContain("Unauthorised access");
    expect(html).toContain("12");
    expect(html).toContain("Not set"); // optional target
    expect(html).toContain("matrix (impact × probability)");
    expect(html).toContain("Probability 4");
    expect(html).toContain("Impact 4");
  });
  it("flags HIGH current residual risk with the consultation prompt and shows overdue measures", () => {
    const html = render("J2", page()).replace(/<!-- -->/g, "");
    expect(html).toContain("Current residual risk is HIGH");
    expect(html).toContain("Overdue");
    expect(html).toContain("do not change any score or decision");
  });
  it("offers example risks as starting points that must be adapted and confirmed", () => {
    const html = render("J2", pageStub());
    expect(html).toContain("Start from an example risk");
    expect(html).toContain("You must adapt it to your processing");
    expect(html).toContain("without scores");
  });
  it("shows the consultation prompt in the supervisory authority section only for current residual HIGH", () => {
    expect(render("K3", page()).replace(/<!-- -->/g, "")).toContain("For the DPO and owner to consider");
    expect(render("K3", pageStub())).toContain("A high inherent score alone does not trigger this question");
  });
});
