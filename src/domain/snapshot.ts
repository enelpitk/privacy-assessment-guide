// Submitted-snapshot content (docs/architecture.md section 3). Pure. The hash is computed on the server.
import { collectionIndex, fieldIndex } from "@/content";
import { RULES_VERSION, TEMPLATE_VERSION } from "@/content";
import { buildModel, type RecordRow, type RespRow } from "./model";
import { evaluateScreening } from "./screening";
import { SCREENING_SUBSECTIONS, type Path } from "./workflow";

export type SnapshotScope = "SCREENING" | "FULL" | "FINAL";

export interface SnapshotResponse extends RespRow {
  revision: number;
  editorName?: string;
}

export interface SnapshotRecord extends RecordRow {
  revision?: number;
}

export interface SnapshotEntity {
  id: string;
  kind: string;
  name: string;
}

export interface SnapshotPayload {
  scope: SnapshotScope;
  templateVersion: string;
  rulesVersion: string;
  versionNumber: string;
  path: Path;
  takenAt: string;
  ownerId: string;
  assignedDpoId: string;
  responses: SnapshotResponse[];
  records: SnapshotRecord[];
  entities: SnapshotEntity[];
  /** Independent indications computed from the confirmed answers at the time. */
  screening: {
    fullDpiaIndicated: boolean;
    fullBecause: string[];
    tiaIndicated: boolean;
    unresolved: { q: string; reason: string }[];
    confirmed: Record<string, string>;
    suggested: Record<string, string>;
  };
}

const inScope = (subsectionId: string, scope: SnapshotScope) =>
  scope !== "SCREENING" || SCREENING_SUBSECTIONS.includes(subsectionId);

export function buildSnapshotPayload(i: {
  scope: SnapshotScope;
  versionNumber: string;
  path: Path;
  takenAt: string;
  ownerId: string;
  assignedDpoId: string;
  responses: SnapshotResponse[];
  records: SnapshotRecord[];
  entities: SnapshotEntity[];
}): SnapshotPayload {
  const recordSub = (collection: string) => collectionIndex.get(collection)?.subsectionId ?? "";
  const records = i.records.filter((r) => inScope(recordSub(r.collection), i.scope));
  const liveIds = new Set(records.map((r) => r.id));
  const responses = i.responses.filter((r) => {
    const loc = fieldIndex.get(r.fieldId);
    if (!loc || !inScope(loc.subsectionId, i.scope)) return false;
    return r.recordId === "" || liveIds.has(r.recordId);
  });
  // The indications are computed from ALL live answers, so a screening snapshot records what screening showed.
  const ev = evaluateScreening(buildModel(i.responses, i.records, "OPEN").ctx);
  const confirmed: Record<string, string> = {};
  const suggested: Record<string, string> = {};
  for (const [q, r] of Object.entries(ev.questions)) {
    confirmed[q] = r.confirmed;
    suggested[q] = r.noSuggestion ? "NONE" : r.suggestion;
  }
  return {
    scope: i.scope,
    templateVersion: TEMPLATE_VERSION,
    rulesVersion: RULES_VERSION,
    versionNumber: i.versionNumber,
    path: i.path,
    takenAt: i.takenAt,
    ownerId: i.ownerId,
    assignedDpoId: i.assignedDpoId,
    responses,
    records,
    entities: i.entities,
    screening: {
      fullDpiaIndicated: ev.outcomes.fullDpiaIndicated,
      fullBecause: ev.outcomes.fullBecause,
      tiaIndicated: ev.outcomes.tiaIndicated,
      unresolved: ev.outcomes.unresolved,
      confirmed,
      suggested,
    },
  };
}

/** Deterministic JSON (sorted keys) so the same content always hashes the same. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}
