import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the few Prisma calls the server code makes. This verifies the server logic
// (permissions, revision checks, locks, validation). It does NOT verify real PostgreSQL behaviour.
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const s = {
    users: [] as Row[],
    assessments: [] as Row[],
    assignments: [] as Row[],
    access: [] as Row[],
    records: [] as Row[],
    fields: [] as Row[],
    entities: [] as Row[],
    seq: 0,
  };
  const match = (row: Row, where: Row | undefined) =>
    !where ||
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        const o = v as Row;
        if ("in" in o) return (o.in as unknown[]).includes(row[k]);
        if ("not" in o) return row[k] !== o.not;
        if ("equals" in o) return String(row[k]).toLowerCase() === String(o.equals).toLowerCase();
        return true;
      }
      if (v === null) return row[k] === null || row[k] === undefined;
      return row[k] === v;
    });
  const find = (tbl: Row[], where?: Row) => tbl.find((r) => match(r, where));
  const compound = (w: Row) => (w as { versionId_fieldId_recordId?: Row }).versionId_fieldId_recordId;
  const prisma = {
    user: { findUnique: async ({ where }: { where: Row }) => find(s.users, where) ?? null },
    assessment: {
      findUnique: async ({ where }: { where: Row }) => find(s.assessments, where) ?? null,
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const r = find(s.assessments, where)!;
        Object.assign(r, data);
        return r;
      },
    },
    assignment: { findMany: async ({ where }: { where: Row }) => s.assignments.filter((r) => match(r, where)) },
    assessmentAccess: { findFirst: async ({ where }: { where: Row }) => find(s.access, where) ?? null },
    recordItem: {
      findMany: async ({ where }: { where: Row }) => s.records.filter((r) => match(r, where)),
      findFirst: async ({ where }: { where: Row }) => find(s.records, where) ?? null,
      create: async ({ data }: { data: Row }) => {
        const r = { id: `rec${++s.seq}`, revision: 1, deletedAt: null, ...data };
        s.records.push(r);
        return r;
      },
    },
    responseField: {
      findUnique: async ({ where }: { where: Row }) => find(s.fields, compound(where)) ?? null,
      findMany: async ({ where }: { where: Row }) => s.fields.filter((r) => match(r, where)),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const rows = s.fields.filter((r) => match(r, where));
        for (const r of rows) {
          const { revision, ...rest } = data as { revision?: { increment: number } } & Row;
          Object.assign(r, rest);
          if (revision) r.revision = (r.revision as number) + revision.increment;
        }
        return { count: rows.length };
      },
      createMany: async ({ data }: { data: Row[] }) => {
        let count = 0;
        for (const d of data) {
          if (find(s.fields, { versionId: d.versionId, fieldId: d.fieldId, recordId: d.recordId })) continue;
          s.fields.push({ id: `f${++s.seq}`, lastEditedAt: new Date(), ...d });
          count++;
        }
        return { count };
      },
    },
  };
  return { s, prisma };
});

vi.mock("@/lib/db", () => ({ prisma: h.prisma }));

import { saveChanges, type ChangeIn } from "@/server/save";
import { createRecord } from "@/server/structure";
import { HttpError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";

const U = (id: string, roles: CurrentUser["roles"], name = id): CurrentUser => ({ id, displayName: name, jobTitle: "", roles, departmentId: null });
const owner = U("o1", ["OWNER"], "Alex Rowan");
const owner2 = U("o2", ["OWNER"], "Priya Nandi");
const contrib = U("c1", ["CONTRIBUTOR"], "Sam Okafor");
const dpo = U("d1", ["DPO"], "Dana Whitfield");
const stranger = U("x1", ["OWNER"], "Stranger");

beforeEach(() => {
  const s = h.s;
  s.users = [owner, owner2, contrib, dpo, stranger].map((u) => ({ id: u.id, displayName: u.displayName }));
  s.assessments = [
    { id: "a1", ownerId: "o1", assignedDpoId: "d1", lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED", currentVersionId: "v1" },
  ];
  s.assignments = [{ id: "as1", assessmentId: "a1", assigneeId: "c1", subsectionIds: ["H3"], status: "IN_PROGRESS" }];
  s.access = [];
  s.records = [];
  s.fields = [];
  s.entities = [];
  s.seq = 0;
});

const change = (over: Partial<ChangeIn>): ChangeIn => ({
  fieldId: "A.description",
  recordId: "",
  baseRevision: 0,
  value: "text",
  state: "ANSWERED",
  ...over,
});

describe("server save: persistence and optimistic concurrency", () => {
  it("creates an answer at revision 1 and increments on later saves", async () => {
    const [a] = await saveChanges(owner, "a1", [change({})]);
    expect(a.status).toBe("saved");
    const [b] = await saveChanges(owner, "a1", [change({ baseRevision: 1, value: "newer" })]);
    expect(b.status).toBe("saved");
    if (b.status === "saved") expect(b.saved.revision).toBe(2);
    expect(h.s.fields).toHaveLength(1);
    expect(h.s.fields[0].value).toBe("newer");
  });

  it("detects a stale write and does not overwrite the stored answer", async () => {
    await saveChanges(owner, "a1", [change({ value: "v1" })]);
    await saveChanges(owner, "a1", [change({ baseRevision: 1, value: "v2 by owner" })]);
    const [res] = await saveChanges(owner, "a1", [change({ baseRevision: 1, value: "stale write" })]);
    expect(res.status).toBe("conflict");
    if (res.status === "conflict") {
      expect(res.saved?.value).toBe("v2 by owner");
      expect(res.saved?.revision).toBe(2);
    }
    expect(h.s.fields[0].value).toBe("v2 by owner");
  });

  it("reports a conflict when the client thinks a field is new but it already exists", async () => {
    await saveChanges(owner, "a1", [change({ value: "first" })]);
    const [res] = await saveChanges(owner, "a1", [change({ baseRevision: 0, value: "second" })]);
    expect(res.status).toBe("conflict");
    expect(h.s.fields[0].value).toBe("first");
  });

  it("saves different fields independently within one request", async () => {
    await saveChanges(owner, "a1", [change({ fieldId: "A.description", value: "a" })]);
    const res = await saveChanges(owner, "a1", [
      change({ fieldId: "A.description", baseRevision: 0, value: "stale" }), // conflict
      change({ fieldId: "D.launchDate", value: "2027-01-31" }), // still saved
    ]);
    expect(res.map((r) => r.status)).toEqual(["conflict", "saved"]);
  });

  it("stores unresolved states without turning them into answers", async () => {
    const [res] = await saveChanges(owner, "a1", [change({ fieldId: "C.q3", value: null, state: "NOT_SURE", rationale: "Need legal help" })]);
    expect(res.status).toBe("saved");
    expect(h.s.fields[0].state).toBe("NOT_SURE");
  });
});

describe("server save: permissions are enforced on the server", () => {
  it("hides assessments from users with no access (404, not 403)", async () => {
    await expect(saveChanges(stranger, "a1", [change({})])).rejects.toMatchObject({ status: 404 });
    await expect(saveChanges(owner2, "a1", [change({})])).rejects.toBeInstanceOf(HttpError);
  });

  it("lets a DPO read but never edit owner answers", async () => {
    const [res] = await saveChanges(dpo, "a1", [change({})]);
    expect(res.status).toBe("rejected");
    expect(h.s.fields).toHaveLength(0);
  });

  it("lets a contributor edit only the assigned subsection", async () => {
    const ok = await saveChanges(contrib, "a1", [change({ fieldId: "H.sec.measures", value: "MFA required" })]);
    expect(ok[0].status).toBe("saved");
    const no = await saveChanges(contrib, "a1", [change({ fieldId: "H.p.fairness", value: "x" })]);
    expect(no[0].status).toBe("rejected");
  });

  it("stops a contributor after their assignment is completed", async () => {
    h.s.assignments[0].status = "COMPLETED";
    const [res] = await saveChanges(contrib, "a1", [change({ fieldId: "H.sec.measures", value: "x" })]);
    expect(res.status).toBe("rejected");
  });

  it("never lets a contributor change administrative fields, even if assigned", async () => {
    h.s.assignments[0].subsectionIds = ["K5"];
    const [res] = await saveChanges(contrib, "a1", [change({ fieldId: "K.review.periodic", value: "YES" })]);
    expect(res.status).toBe("rejected");
  });

  it("rejects workflow-owned and computed fields for everyone", async () => {
    const r1 = await saveChanges(owner, "a1", [change({ fieldId: "K.dpo.opinion", value: "x" })]);
    const r2 = await saveChanges(owner, "a1", [change({ fieldId: "J.risk.inh.score", recordId: "rec1", value: "6" })]);
    expect(r1[0].status).toBe("rejected");
    expect(r2[0].status).toBe("rejected");
  });

  it("applies review locks: substantive edits blocked in review, allowed again when changes are requested", async () => {
    h.s.assessments[0].lifecycle = "IN_DPO_REVIEW";
    const [locked] = await saveChanges(owner, "a1", [change({})]);
    expect(locked.status).toBe("rejected");
    h.s.assessments[0].lifecycle = "CHANGES_REQUESTED";
    const [open] = await saveChanges(owner, "a1", [change({})]);
    expect(open.status).toBe("saved");
  });

  it("locks the submitted screening sections but not later stages", async () => {
    h.s.assessments[0].screeningStatus = "AWAITING_DPO";
    const [c] = await saveChanges(owner, "a1", [change({ fieldId: "C.q3", value: "YES" })]);
    const [d] = await saveChanges(owner, "a1", [change({ fieldId: "D.launchDate", value: "2027-01-31" })]);
    expect(c.status).toBe("rejected");
    expect(d.status).toBe("saved");
  });

  it("makes archived assessments read-only", async () => {
    h.s.assessments[0].lifecycle = "ARCHIVED";
    const [res] = await saveChanges(owner, "a1", [change({})]);
    expect(res.status).toBe("rejected");
  });
});

describe("server save: validation and records", () => {
  it("rejects unknown fields and invalid formats", async () => {
    const res = await saveChanges(owner, "a1", [
      change({ fieldId: "Z.nothing" }),
      change({ fieldId: "D.launchDate", value: "31/01/2027" }),
      change({ fieldId: "C.q3", value: "MAYBE" }),
      change({ fieldId: "C.q3", state: "NOT_APPLICABLE", value: null }),
    ]);
    expect(res.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected", "rejected"]);
    expect(h.s.fields).toHaveLength(0);
  });

  it("requires a real, live record of the right collection for fields inside records", async () => {
    const missing = await saveChanges(owner, "a1", [change({ fieldId: "E.purpose.purpose", recordId: "nope" })]);
    expect(missing[0].status).toBe("rejected");
    const rec = await createRecord(owner, "a1", "E.purposes", null);
    const wrongCollection = await saveChanges(owner, "a1", [change({ fieldId: "B.ctrl.role", recordId: rec.id })]);
    expect(wrongCollection[0].status).toBe("rejected");
    const ok = await saveChanges(owner, "a1", [change({ fieldId: "E.purpose.purpose", recordId: rec.id, value: "Check affordability" })]);
    expect(ok[0].status).toBe("saved");
    const topLevelWithRecord = await saveChanges(owner, "a1", [change({ fieldId: "A.description", recordId: rec.id })]);
    expect(topLevelWithRecord[0].status).toBe("rejected");
  });

  it("only allows structural changes inside editable scope", async () => {
    await expect(createRecord(contrib, "a1", "E.purposes", null)).rejects.toMatchObject({ status: 403 });
    await expect(createRecord(owner, "a1", "K.decision.condition", null)).rejects.toMatchObject({ status: 403 }); // workflow list
    await expect(createRecord(owner, "a1", "B.sub", null)).rejects.toMatchObject({ status: 400 }); // needs a parent processor
    const proc = await createRecord(owner, "a1", "B.proc", null);
    const sub = await createRecord(owner, "a1", "B.sub", proc.id);
    expect(sub.parentId).toBe(proc.id);
  });
});

describe("server save: screening suggestion records", () => {
  it("stores the preserved suggestion within the same subsection permissions as the answer", async () => {
    h.s.assignments[0].subsectionIds = ["C1"];
    const ok = await saveChanges(contrib, "a1", [
      change({ fieldId: "C.q1", value: "NO" }),
      change({ fieldId: "C.q1.suggested", value: JSON.stringify({ rules: "rules-1.0.0", suggested: "YES", confirmed: "NO" }) }),
    ]);
    expect(ok.map((x) => x.status)).toEqual(["saved", "saved"]);
    const other = await saveChanges(contrib, "a1", [change({ fieldId: "C.q3.suggested", value: "{}" })]);
    expect(other[0].status).toBe("rejected"); // C3 is not assigned
  });
});

