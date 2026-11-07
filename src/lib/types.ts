import type { AnswerState } from "@/domain/conditions";
import type { AccessCtx, Actor } from "@/domain/permissions";
import type { Path } from "@/domain/workflow";
import type { ThreadView } from "./govTypes";

export interface ClientField {
  value: unknown;
  state: AnswerState;
  rationale: string | null;
  revision: number;
  editorName: string;
  lastEditedAt: string;
}

export interface ClientRecord {
  id: string;
  collection: string;
  parentId: string | null;
  ordering: number;
  revision: number;
}

export interface ClientEntity {
  id: string;
  kind: "PARTY" | "DATA_SUBJECT" | "DATA_CATEGORY";
  name: string;
  revision: number;
}

export interface PersonOption {
  id: string;
  name: string;
  role: string;
}

export interface ClientAssessment {
  id: string;
  displayId: string;
  name: string;
  lifecycle: string;
  /** Finalised with a latest owner decision of "Rejected" (shown as "Finalised — Rejected"). */
  rejected?: boolean;
  screeningStatus: string;
  versionNumber: string;
  ownerId: string;
  ownerName: string;
  dpoName: string;
  department: string;
  groupEntity: string;
  createdAt: string;
}

export interface VersionRow {
  versionNumber: string;
  createdAt: string;
  authorName: string;
  note: string;
}

export interface PageData {
  assessment: ClientAssessment;
  actor: Actor;
  ctx: AccessCtx;
  fields: Record<string, ClientField>;
  records: ClientRecord[];
  entities: ClientEntity[];
  people: PersonOption[];
  versions: VersionRow[];
  lastSubsection: string | null;
  /** Screening path. PRE_ONLY deactivates the full-assessment sections (their answers are kept). */
  path: Path;
  threads: ThreadView[];
  /** Sections of this version still marked "Carried forward — please review". */
  unreviewed: string[];
}

export const fieldKey = (fieldId: string, recordId: string) => `${fieldId}|${recordId}`;
