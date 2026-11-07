import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

import { CollabProvider } from "@/components/form/collab";
import { StoreCtx } from "@/components/form/context";
import { HistoryPanel, ReviewPanel, TeamPanel } from "@/components/form/Governance";
import { AssessmentStore } from "@/components/form/store";
import type { GovernanceData } from "@/lib/govTypes";
import type { PageData } from "@/lib/types";
import { pageStub } from "./helpers";

const gov = (o: Partial<GovernanceData> = {}): GovernanceData => ({
  state: { lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED", path: "OPEN", everSubmitted: false, openBlocking: 0, latestOpinion: null },
  ownerName: "Alex Rowan",
  dpoName: "Dana Whitfield",
  archivedFrom: null,
  screening: null,
  screeningBlockers: [],
  fullBlockers: [],
  assignments: [],
  access: [],
  people: {
    owners: [{ id: "o2", name: "Priya Nandi", title: "Owner", roles: ["OWNER"] }],
    dpos: [],
    assignable: [{ id: "c1", name: "Sam Okafor", title: "Contributor", roles: ["CONTRIBUTOR"] }],
    shareable: [{ id: "x1", name: "Other Person", title: "Someone", roles: ["OWNER"] }],
  },
  screeningDecisions: [],
  opinions: [],
  blocking: [],
  ownerDecisions: [],
  conditions: [],
  measures: [],
  snapshots: [],
  versions: [{ id: "v1", versionNumber: "1.0", kind: "DRAFT", createdAt: "2026-11-08T10:00:00.000Z", reason: null, changeDescription: null, categories: [], current: true, rejected: false }],
  events: [],
  unreviewed: [],
  ...o,
});

type Who = "owner" | "dpo" | "otherDpo" | "contributor" | "admin";
function page(who: Who, over: Partial<PageData["ctx"]> = {}, assessment: Partial<PageData["assessment"]> = {}): PageData {
  const actor = { owner: { id: "o1", roles: ["OWNER"] }, dpo: { id: "d1", roles: ["DPO"] }, otherDpo: { id: "d2", roles: ["DPO"] }, contributor: { id: "c1", roles: ["CONTRIBUTOR"] }, admin: { id: "a1", roles: ["ADMIN"] } }[who] as PageData["actor"];
  const base = pageStub();
  return { ...base, actor, ctx: { ...base.ctx, isAssignee: who === "contributor", ...over }, assessment: { ...base.assessment, ...assessment } };
}

function render(node: (g: GovernanceData) => React.ReactElement, p: PageData, g: GovernanceData) {
  const store = new AssessmentStore(p);
  return renderToString(
    <StoreCtx.Provider value={{ store, page: p, navigate: async () => undefined }}>
      <CollabProvider page={p}>{node(g)}</CollabProvider>
    </StoreCtx.Provider>,
  );
}
const review = (who: Who, g: GovernanceData, ctx: Partial<PageData["ctx"]> = {}) => render((x) => <ReviewPanel gov={x} />, page(who, ctx), g).replace(/<!-- -->/g, "");
const team = (who: Who, g: GovernanceData, ctx: Partial<PageData["ctx"]> = {}) => render((x) => <TeamPanel gov={x} />, page(who, ctx), g).replace(/<!-- -->/g, "");
const history = (who: Who, g: GovernanceData, ctx: Partial<PageData["ctx"]> = {}) => render((x) => <HistoryPanel gov={x} />, page(who, ctx), g).replace(/<!-- -->/g, "");

describe("review screen shows the right actions to the right role", () => {
  it("owner at a fresh draft sees the submit action and what blocks it, but no DPO forms", () => {
    const blockers = [{ subsectionId: "C3", fieldId: "C.q3", label: "Will the processing involve new technologies", reason: "Not answered." }];
    const html = review("owner", gov({ screeningBlockers: blockers }));
    expect(html).toContain("Submit pre-assessment for DPO review");
    expect(html).toContain("1 item must be dealt with before this can be submitted");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Submit pre-assessment/);
    expect(html).not.toContain("Record screening decision");
    expect(html).not.toContain("Submit formal opinion");
  });
  it("submit is enabled when nothing blocks", () => {
    const html = review("owner", gov());
    expect(html).toContain("Nothing blocks submission");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Submit pre-assessment/);
  });
  it("assigned DPO sees the screening decision form once the screening awaits review; the exception fields appear only when a full DPIA was indicated", () => {
    const g = gov({ state: { ...gov().state, screeningStatus: "AWAITING_DPO" }, screening: { fullDpiaIndicated: true, tiaIndicated: false, unresolved: [], snapshotId: "s1" } });
    const html = review("dpo", g, { screeningStatus: "AWAITING_DPO" });
    expect(html).toContain("Record screening decision");
    expect(html).toContain("Rationale (always required)");
    expect(html).toContain("Decision (DPO)");
    expect(html).not.toContain("Exception justification"); // only after choosing 'pre-assessment sufficient'
  });
  it("another DPO and the owner see that only the assigned DPO can decide", () => {
    const g = gov({ state: { ...gov().state, screeningStatus: "AWAITING_DPO" } });
    const other = review("otherDpo", g, { screeningStatus: "AWAITING_DPO" });
    expect(other).toContain("Only Dana Whitfield, the assigned DPO, can record this decision");
    expect(other).not.toContain("Record screening decision");
    expect(review("owner", g, { screeningStatus: "AWAITING_DPO" })).not.toContain("Record screening decision");
  });
  it("during DPO review the assigned DPO can request changes, submit an opinion and mark blocking issues; the owner can only withdraw", () => {
    const g = gov({ state: { ...gov().state, lifecycle: "IN_DPO_REVIEW", screeningStatus: "DECIDED", path: "FULL" } });
    const dpo = review("dpo", g, { lifecycle: "IN_DPO_REVIEW", screeningStatus: "DECIDED" });
    expect(dpo).toContain("Request changes");
    expect(dpo).toContain("Submit formal opinion");
    expect(dpo).toContain("Mark as blocking");
    expect(dpo).toContain("Once submitted it cannot be edited");
    const own = review("owner", g, { lifecycle: "IN_DPO_REVIEW", screeningStatus: "DECIDED" });
    expect(own).toContain("Withdraw for editing");
    expect(own).not.toContain("Submit formal opinion");
    expect(own).toContain("Substantive editing is locked");
  });
  it("shows submitted opinions as read-only history, marks superseded ones, and offers amendment only to the assigned DPO", () => {
    const ops = [
      { id: "p1", kind: "FULL", dpoName: "Dana Whitfield", category: "NO_OBJECTIONS" as const, opinionText: "No objections.", recommendations: null, supersedesId: null, superseded: true, earlierScreeningCycle: false, createdAt: "2026-11-08T10:00:00.000Z" },
      { id: "p2", kind: "FULL", dpoName: "Dana Whitfield", category: "OBJECTIONS_REMAIN" as const, opinionText: "Objections now remain.", recommendations: null, supersedesId: "p1", superseded: false, earlierScreeningCycle: false, createdAt: "2026-11-08T11:00:00.000Z" },
    ];
    const g = gov({ opinions: ops, state: { ...gov().state, lifecycle: "AWAITING_OWNER_DECISION", screeningStatus: "DECIDED", path: "FULL", latestOpinion: "OBJECTIONS_REMAIN" } });
    const ctx = { lifecycle: "AWAITING_OWNER_DECISION" as const, screeningStatus: "DECIDED" as const };
    const html = review("dpo", g, ctx);
    expect(html).toContain("Superseded");
    expect(html).toContain("Amendment");
    expect(html).toContain("Record amended opinion");
    expect(html).toContain("never changed");
    expect(review("owner", g, ctx)).not.toContain("Record amended opinion");
  });
  it("owner decision form: requires acknowledgement of departure, warns about open blocking issues, offers reopen", () => {
    const g = gov({ state: { ...gov().state, lifecycle: "AWAITING_OWNER_DECISION", screeningStatus: "DECIDED", path: "FULL", latestOpinion: "RECOMMENDATIONS", openBlocking: 1 } });
    const html = review("owner", g, { lifecycle: "AWAITING_OWNER_DECISION", screeningStatus: "DECIDED" });
    expect(html).toContain("Record decision");
    expect(html).toContain("A DPO blocking issue is open");
    expect(html).toContain("Reopen for changes");
    expect(html).toContain("Approved");
    expect(html).toContain("Conditionally approved");
    expect(html).toContain("Rejected");
    expect(html).toContain("depart from the DPO’s opinion");
    expect(review("dpo", g, { lifecycle: "AWAITING_OWNER_DECISION" })).not.toContain("Record decision");
  });
  it("CD-31: Review page separates the status at decision from the latest recorded status", () => {
    const m = { id: "m1", riskName: "Risk 1", description: "Encrypt exports", responsibleName: "Sam Okafor", responsibleUserId: "c1", due: "2026-12-01", status: "COMPLETED", registerStatus: "IN_PROGRESS", latestRecordedStatus: "COMPLETED", overdue: false, progress: [{ status: "COMPLETED", note: "Done", authorName: "Sam Okafor", createdAt: "2026-11-09T10:00:00.000Z" }] };
    const g = gov({ measures: [m], state: { ...gov().state, lifecycle: "FINALISED", screeningStatus: "DECIDED", path: "FULL" } });
    const html = review("owner", g, { lifecycle: "FINALISED", screeningStatus: "DECIDED" });
    expect(html).toMatch(/Status at decision:<\/strong>[^<]*In progress/);
    expect(html).toMatch(/Latest recorded status:<\/strong>[^<]*Completed/);
    const none = review("owner", gov({ measures: [{ ...m, latestRecordedStatus: null, progress: [] }], state: { ...gov().state, lifecycle: "FINALISED", screeningStatus: "DECIDED", path: "FULL" } }), { lifecycle: "FINALISED", screeningStatus: "DECIDED" });
    expect(none).toContain("no progress recorded");
  });
  it("display: a rejected finalised version is labelled \"Finalised — Rejected\" in the header card and the version history, an approved one is not", () => {
    const base = gov();
    const rej = gov({ versions: [{ ...base.versions[0], kind: "FINALISED", rejected: true }], state: { ...base.state, lifecycle: "FINALISED", screeningStatus: "DECIDED", path: "FULL" } });
    const html = review("owner", rej, { lifecycle: "FINALISED", screeningStatus: "DECIDED" });
    expect(html).toContain("Finalised — Rejected");
    expect(history("owner", rej, { lifecycle: "FINALISED" })).toContain("Finalised — Rejected");
    const ok = gov({ versions: [{ ...base.versions[0], kind: "FINALISED", rejected: false }], state: { ...base.state, lifecycle: "FINALISED", screeningStatus: "DECIDED", path: "FULL" } });
    expect(history("owner", ok, { lifecycle: "FINALISED" })).not.toContain("Rejected");
    expect(review("owner", ok, { lifecycle: "FINALISED", screeningStatus: "DECIDED" })).not.toContain("Finalised — Rejected");
  });
  it("display: an opinion from an earlier screening cycle is labelled and explained as historical, apart from a current-cycle opinion", () => {
    const earlier = { id: "s1", kind: "SCREENING", dpoName: "Dana Whitfield", category: "NO_OBJECTIONS" as const, opinionText: "Short opinion, first cycle.", recommendations: null, supersedesId: null, superseded: false, earlierScreeningCycle: true, createdAt: "2026-11-08T10:00:00.000Z" };
    const current = { ...earlier, id: "s2", opinionText: "Short opinion, second cycle.", earlierScreeningCycle: false, createdAt: "2026-11-08T12:00:00.000Z" };
    const html = review("owner", gov({ opinions: [earlier, current] }));
    expect(html).toContain("Earlier screening cycle");
    expect(html).toContain("does not count for the current screening cycle");
    expect(html.match(/Earlier screening cycle/g)).toHaveLength(1); // only the earlier row is labelled
    expect(html).toContain("Short opinion, first cycle.");
    expect(html).toContain("Short opinion, second cycle.");
    expect(review("owner", gov({ opinions: [current] }))).not.toContain("Earlier screening cycle");
  });
  it("shows a recorded departure from the DPO's opinion prominently", () => {
    const g = gov({ ownerDecisions: [{ id: "d", ownerName: "Alex Rowan", decision: "APPROVED", rationale: "Approved.", departsFromDpo: true, departureRationale: "We accept the residual risk.", supersedesId: null, reviewedSnapshotId: "s", createdAt: "2026-11-08T12:00:00.000Z" }] });
    expect(review("dpo", g)).toContain("departs from the DPO’s opinion and accepts the risk");
    expect(review("dpo", g)).toContain("We accept the residual risk.");
  });
  it("conditions: progress by the responsible person is separate; only the owner confirms", () => {
    const conds = [{ id: "k1", description: "Complete the DPA", responsibleName: "Sam Okafor", responsibleUserId: "c1", deadline: "2020-01-01", overdue: true, confirmedAt: null, confirmationNote: null, progress: [] }];
    const g = gov({ conditions: conds, state: { ...gov().state, lifecycle: "AWAITING_CONDITIONS", screeningStatus: "DECIDED", path: "FULL" } });
    const ctx = { lifecycle: "AWAITING_CONDITIONS" as const };
    const own = review("owner", g, ctx);
    expect(own).toContain("Confirm complete");
    expect(own).toContain("Record progress");
    expect(own).toContain("Overdue since 2020-01-01");
    const resp = review("contributor", g, ctx);
    expect(resp).toContain("Record progress");
    expect(resp).not.toContain("Confirm complete");
    expect(review("dpo", g, ctx)).not.toContain("Record progress");
  });
});

describe("team and sharing screen", () => {
  it("owner can assign, share and transfer; the DPO cannot be reassigned here", () => {
    const html = team("owner", gov());
    expect(html).toContain("Assign sections");
    expect(html).toContain("Give view access");
    expect(html).toContain("Transfer ownership");
    expect(html).toContain("Only the demo administrator can");
    expect(html).toContain("Select all assignable sections");
    expect(html).not.toContain("4.7 Data sharing</label>".replace("4.7", "9.9"));
  });
  it("formal-decision subsections are not offered for assignment", () => {
    const html = team("owner", gov());
    for (const s of ["DPO screening decision", "Final decision and conditions", "Assessment version history", "Periodic review"]) expect(html, s).not.toContain(`>${s}<`);
  });
  it("a contributor sees only their own assignment with Start and Mark complete, and no admin forms", () => {
    const a = [{ id: "a1", assigneeId: "c1", assigneeName: "Sam Okafor", subsectionIds: ["H3"], taskDescription: "Describe security", deadline: null, status: "PENDING", overdue: false }];
    const html = team("contributor", gov({ assignments: a }));
    expect(html).toContain("Start");
    expect(html).toContain("Mark complete");
    expect(html).not.toContain("Assign sections");
    expect(html).not.toContain("Transfer ownership");
    expect(html).not.toContain("Give view access");
    expect(html).not.toContain("Cancel assignment");
  });
  it("explains that assignment, sharing and responsibility are separate", () => {
    expect(team("owner", gov())).toContain("three separate actions");
  });
});

describe("history and versions screen", () => {
  it("a finalised assessment offers 'Start review / update' with change categories", () => {
    const g = gov({ state: { ...gov().state, lifecycle: "FINALISED", screeningStatus: "DECIDED", path: "FULL", everSubmitted: true } });
    const html = history("owner", g, { lifecycle: "FINALISED" });
    expect(html).toContain("Start review / update");
    for (const c of ["Purpose", "Data types", "Population / scale", "Technology", "Parties", "Countries", "Risks", "Periodic review", "Other"]) expect(html, c).toContain(c);
    expect(html).toContain("Earlier approvals and DPO opinions are not carried");
    expect(html).toContain("only be archived, not deleted");
    expect(html).not.toContain("Delete draft permanently");
  });
  it("a never-submitted draft can be deleted with confirmation; others cannot", () => {
    const html = history("owner", gov());
    expect(html).toContain("Delete draft permanently");
    expect(html).toContain("I understand this is permanent");
    expect(history("dpo", gov())).not.toContain("Delete draft permanently");
  });
  it("lists snapshots as read-only links with a fingerprint, and shows carried-forward sections", () => {
    const g = gov({ snapshots: [{ id: "s1", kind: "FULL_SUBMITTED", versionNumber: "1.0", takenAt: "2026-11-08T10:00:00.000Z", takenByName: "Alex Rowan", hash: "abcdef123456" }], unreviewed: ["A1", "A2"] });
    const html = history("owner", g);
    expect(html).toContain("/versions/s1");
    expect(html).toContain("fingerprint abcdef123456");
    expect(html).toContain("2 sections still marked");
  });
  it("shows the activity history without keystroke logging", () => {
    const g = gov({ events: [{ id: "e1", type: "OWNERSHIP_TRANSFERRED", actorName: "Alex Rowan", createdAt: "2026-11-08T10:00:00.000Z", summary: "Ownership transferred: Alex Rowan → Priya Nandi" }] });
    const html = history("owner", g);
    expect(html).toContain("Ownership transferred: Alex Rowan → Priya Nandi");
    expect(html).toContain("Individual keystrokes are not logged");
  });
  it("an archived assessment offers restore to the owner only", () => {
    const g = gov({ state: { ...gov().state, lifecycle: "ARCHIVED" } });
    expect(history("owner", g, { lifecycle: "ARCHIVED" })).toContain("Restore from the archive");
    expect(history("dpo", g, { lifecycle: "ARCHIVED" })).not.toContain("Restore from the archive");
  });
});
