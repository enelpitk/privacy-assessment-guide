// Minimal in-memory stand-in for the Prisma calls used by the server code. It verifies server LOGIC
// (permissions, state guards, validation, immutability rules, record copying). It does NOT verify real
// PostgreSQL behaviour, transactions or the migration. No rollback is emulated.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DEFAULTS: Record<string, () => Row> = {
  assessment: () => ({ lifecycle: "DRAFT", screeningStatus: "NOT_SUBMITTED", screeningPath: "OPEN", everSubmitted: false, archivedFrom: null, archivedAt: null, nextReviewDate: null }),
  assessmentVersion: () => ({ kind: "DRAFT", changeCategories: [], revisionReason: null, changeDescription: null, carriedFromVersionId: null }),
  assignment: () => ({ status: "PENDING", deadline: null, completedAt: null }),
  assessmentAccess: () => ({ revokedAt: null }),
  recordItem: () => ({ revision: 1, deletedAt: null, parentId: null }),
  entity: () => ({ revision: 1, deletedAt: null }),
  responseField: () => ({ revision: 1, recordId: "", value: null, rationale: null }),
  blockingIssue: () => ({ status: "OPEN", subsectionId: null, resolvedById: null, resolvedAt: null, resolutionNote: null, ownerResponse: null }),
  ownerDecision: () => ({ departsFromDpo: false, departureRationale: null, supersedesId: null }),
  dpoOpinion: () => ({ recommendations: null, supersedesId: null }),
  screeningDecision: () => ({ supersededAt: null, exceptionJustification: null, mitigationControls: null, advice: null }),
  condition: () => ({ confirmedAt: null, confirmedById: null, confirmationNote: null, responsibleUserId: null, responsibleText: null, deadline: null }),
  progressRecord: () => ({ status: null }),
  commentThread: () => ({ state: "OPEN", fieldId: null, recordId: null, resolvedById: null, resolvedAt: null }),
  comment: () => ({ isReview: false, parentId: null }),
  reviewMark: () => ({ confirmedAt: null, confirmedById: null }),
  event: () => ({}),
  snapshot: () => ({}),
};
const IMMUTABLE = new Set(["snapshot", "dpoOpinion", "ownerDecision"]);

function match(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((w) => match(row, w));
    if (k === "AND") return (v as Row[]).every((w) => match(row, w));
    if (k.includes("_") && v && typeof v === "object" && !(v instanceof Date) && /^[a-z]+(_[a-zA-Z]+)+$/.test(k)) return match(row, v as Row);
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const o = v as Row;
      if ("in" in o) return (o.in as unknown[]).includes(row[k]);
      if ("not" in o) return o.not === null ? row[k] !== null && row[k] !== undefined : row[k] !== o.not;
      if ("equals" in o) return String(row[k]).toLowerCase() === String(o.equals).toLowerCase();
      if ("lt" in o) return row[k] < o.lt;
      if ("gt" in o) return row[k] > o.gt;
      if ("has" in o) return Array.isArray(row[k]) && row[k].includes(o.has);
      return true;
    }
    if (v === null) return row[k] === null || row[k] === undefined;
    return row[k] === v;
  });
}

export function createFakeDb() {
  const tables: Record<string, Row[]> = {};
  let seq = 0;
  let clock = Date.parse("2026-11-08T10:00:00Z");
  const t = (name: string) => (tables[name] ??= []);
  const stamp = () => new Date((clock += 1000));

  const model = (name: string) => ({
    // Like Prisma, reads return snapshots, not live rows.
    findUnique: async ({ where }: { where: Row }) => copy(t(name).find((r) => match(r, where)) ?? null),
    findFirst: async ({ where, orderBy }: { where?: Row; orderBy?: Row } = {}) => copy(sort(t(name).filter((r) => match(r, where)), orderBy)[0] ?? null),
    findMany: async ({ where, orderBy, take }: { where?: Row; orderBy?: Row; take?: number } = {}) => {
      const rows = sort(t(name).filter((r) => match(r, where)), orderBy);
      return (take ? rows.slice(0, take) : rows).map((r) => copy(r)!);
    },
    count: async ({ where }: { where?: Row } = {}) => t(name).filter((r) => match(r, where)).length,
    create: async ({ data }: { data: Row }) => {
      const row: Row = { id: `${name}-${++seq}`, createdAt: stamp(), updatedAt: stamp(), ...(DEFAULTS[name]?.() ?? {}), ...clean(data) };
      if (name === "responseField") row.lastEditedAt ??= stamp();
      if (name === "snapshot") row.takenAt ??= stamp();
      if (name === "blockingIssue") row.raisedAt ??= stamp();
      t(name).push(row);
      return row;
    },
    createMany: async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) => {
      let count = 0;
      for (const d of data) {
        if (name === "responseField" && skipDuplicates && t(name).some((r) => r.versionId === d.versionId && r.fieldId === d.fieldId && r.recordId === d.recordId)) continue;
        t(name).push({ id: `${name}-${++seq}`, createdAt: stamp(), updatedAt: stamp(), ...(DEFAULTS[name]?.() ?? {}), ...(name === "responseField" ? { lastEditedAt: stamp() } : {}), ...clean(d) });
        count++;
      }
      return { count };
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      if (IMMUTABLE.has(name)) throw new Error(`${name} rows are immutable`);
      const row = t(name).find((r) => match(r, where));
      if (!row) throw new Error(`${name} not found`);
      apply(row, data);
      return row;
    },
    updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
      const rows = t(name).filter((r) => match(r, where));
      if (rows.length && IMMUTABLE.has(name)) throw new Error(`${name} rows are immutable`);
      rows.forEach((r) => apply(r, data));
      return { count: rows.length };
    },
    deleteMany: async ({ where }: { where?: Row } = {}) => {
      const rows = t(name).filter((r) => match(r, where));
      if (rows.length && IMMUTABLE.has(name)) throw new Error(`${name} rows are immutable`);
      tables[name] = t(name).filter((r) => !rows.includes(r));
      return { count: rows.length };
    },
  });

  function copy(r: Row | null): Row | null {
    return r ? { ...r } : null;
  }
  function clean(d: Row): Row {
    const out: Row = {};
    for (const [k, v] of Object.entries(d)) out[k] = v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && "toString" in v && (v as Row).constructor?.name === "NullTypes.DbNull" ? null : v;
    // Prisma.DbNull is a sentinel object; store null.
    for (const k of Object.keys(out)) if (out[k] && typeof out[k] === "object" && !(out[k] instanceof Date) && !Array.isArray(out[k]) && Object.keys(out[k]).length === 0) out[k] = null;
    return out;
  }
  const ASSESSMENT_COLUMNS = new Set(["name", "departmentId", "ownerId", "assignedDpoId", "lifecycle", "screeningStatus", "screeningPath", "archivedAt", "archivedFrom", "everSubmitted", "currentVersionId", "previousAssessmentRef", "nextReviewDate", "updatedAt"]);
  function apply(row: Row, data: Row) {
    if ("displayId" in row && "screeningPath" in row) {
      // Prisma rejects unknown fields; so does this fake for the assessment table.
      for (const k of Object.keys(data)) if (!ASSESSMENT_COLUMNS.has(k)) throw new Error(`Unknown assessment field: ${k}`);
    }
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && "increment" in (v as Row)) row[k] = (row[k] ?? 0) + (v as Row).increment;
      else row[k] = v;
    }
    row.updatedAt = stamp();
  }
  function sort(rows: Row[], orderBy?: Row) {
    if (!orderBy) return [...rows];
    const [k, dir] = Object.entries(orderBy)[0] as [string, string];
    return [...rows].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === "desc" ? -1 : 1));
  }

  const db: Row = {
    user: model("user"),
    department: model("department"),
    assessment: model("assessment"),
    assessmentVersion: model("assessmentVersion"),
    assignment: model("assignment"),
    assessmentAccess: model("assessmentAccess"),
    recordItem: model("recordItem"),
    entity: model("entity"),
    responseField: model("responseField"),
    snapshot: model("snapshot"),
    screeningDecision: model("screeningDecision"),
    dpoOpinion: model("dpoOpinion"),
    blockingIssue: model("blockingIssue"),
    ownerDecision: model("ownerDecision"),
    condition: model("condition"),
    progressRecord: model("progressRecord"),
    commentThread: model("commentThread"),
    comment: model("comment"),
    reviewMark: model("reviewMark"),
    event: model("event"),
    userAssessmentState: model("userAssessmentState"),
  };
  // Unique-key lookups used by the server code.
  const rf = db.responseField.findUnique;
  db.responseField.findUnique = async ({ where }: { where: Row }) => rf({ where: where.versionId_fieldId_recordId ?? where });
  db.$transaction = async (fn: (tx: Row) => unknown) => (typeof fn === "function" ? fn(db) : Promise.all(fn as unknown as Promise<unknown>[]));
  db.$tables = tables;
  db.$reset = () => {
    for (const k of Object.keys(tables)) delete tables[k];
  };
  return db;
}

export const fakeDb = createFakeDb();
