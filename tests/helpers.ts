import type { PageData } from "@/lib/types";

export function pageStub(over: Partial<PageData> = {}): PageData {
  return {
    assessment: {
      id: "a1",
      displayId: "DPIA-2026-0001",
      name: "Test processing",
      lifecycle: "DRAFT",
      screeningStatus: "NOT_SUBMITTED",
      versionNumber: "1.0",
      ownerId: "o1",
      ownerName: "Alex Rowan",
      dpoName: "Dana Whitfield",
      department: "Retail Banking",
      groupEntity: "Harbour Bank",
      createdAt: "2026-11-07T10:00:00.000Z",
    },
    actor: { id: "o1", roles: ["OWNER"] },
    ctx: {
      ownerId: "o1",
      assignedDpoId: "d1",
      lifecycle: "DRAFT",
      screeningStatus: "NOT_SUBMITTED",
      assignedSubsections: [],
      isAssignee: false,
      sharedViewer: false,
    },
    fields: {},
    records: [],
    entities: [],
    people: [{ id: "o1", name: "Alex Rowan", role: "Process owner" }],
    versions: [{ versionNumber: "1.0", createdAt: "2026-11-07T10:00:00.000Z", authorName: "Alex Rowan", note: "Initial draft" }],
    lastSubsection: null,
    ...over,
  };
}
