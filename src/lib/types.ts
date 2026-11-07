import type { AnswerState } from "@/domain/conditions";
import type { AccessCtx, Actor } from "@/domain/permissions";

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
}

export const fieldKey = (fieldId: string, recordId: string) => `${fieldId}|${recordId}`;
