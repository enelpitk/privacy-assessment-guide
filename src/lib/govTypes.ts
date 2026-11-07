// Serialisable shapes passed from server loaders to the governance screens.
import type { Blocker, OpinionCategory, Path } from "@/domain/workflow";

export interface PersonView {
  id: string;
  name: string;
  title: string;
  roles: string[];
}

export interface AssignmentView {
  id: string;
  assigneeId: string;
  assigneeName: string;
  subsectionIds: string[];
  taskDescription: string;
  deadline: string | null;
  status: string;
  overdue: boolean;
}

export interface ScreeningDecisionView {
  id: string;
  dpoName: string;
  decision: string;
  rationale: string;
  exceptionJustification: string | null;
  mitigationControls: string | null;
  advice: string | null;
  indicatedFull: boolean;
  superseded: boolean;
  /** The version this record was made for, and whether that is the version currently shown. */
  versionNumber: string;
  currentVersion: boolean;
  createdAt: string;
}

export interface OpinionView {
  id: string;
  kind: string;
  dpoName: string;
  category: OpinionCategory;
  opinionText: string;
  recommendations: string | null;
  supersedesId: string | null;
  superseded: boolean;
  /** A short screening opinion from an earlier screening cycle (the screening was reopened). Historical only. */
  earlierScreeningCycle: boolean;
  /** The version this record was made for, and whether that is the version currently shown. */
  versionNumber: string;
  currentVersion: boolean;
  createdAt: string;
}

export interface BlockingView {
  id: string;
  reason: string;
  subsectionId: string | null;
  raisedByName: string;
  raisedAt: string;
  status: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  ownerResponse: string | null;
}

export interface ConditionView {
  id: string;
  description: string;
  responsibleName: string;
  responsibleUserId: string | null;
  deadline: string | null;
  overdue: boolean;
  confirmedAt: string | null;
  confirmationNote: string | null;
  progress: { status: string | null; note: string; authorName: string; createdAt: string }[];
}

export interface OwnerDecisionView {
  id: string;
  ownerName: string;
  decision: string;
  rationale: string;
  departsFromDpo: boolean;
  departureRationale: string | null;
  supersedesId: string | null;
  reviewedSnapshotId: string;
  /** The version this record was made for, and whether that is the version currently shown. */
  versionNumber: string;
  currentVersion: boolean;
  createdAt: string;
}

export interface MeasureView {
  id: string;
  riskName: string;
  description: string;
  responsibleName: string;
  responsibleUserId: string | null;
  due: string;
  /** Effective status: the latest recorded progress status, else the register status. */
  status: string;
  /** Status in this version's register (at the decision once the version is decided). Never changed by progress records. */
  registerStatus: string;
  /** Status from the latest progress record that carries one, or null when none was recorded. */
  latestRecordedStatus: string | null;
  overdue: boolean;
  progress: { status: string | null; note: string; authorName: string; createdAt: string }[];
}

export interface SnapshotView {
  id: string;
  kind: string;
  versionNumber: string;
  takenAt: string;
  takenByName: string;
  hash: string;
}

export interface VersionView {
  id: string;
  versionNumber: string;
  kind: string;
  createdAt: string;
  reason: string | null;
  changeDescription: string | null;
  categories: string[];
  current: boolean;
  /** Latest owner decision recorded for this version is "Rejected". */
  rejected: boolean;
}

export interface EventView {
  id: string;
  type: string;
  actorName: string;
  createdAt: string;
  summary: string;
}

export interface GovernanceData {
  state: { lifecycle: string; screeningStatus: string; path: Path; everSubmitted: boolean; openBlocking: number; latestOpinion: OpinionCategory | null };
  ownerName: string;
  dpoName: string;
  archivedFrom: string | null;
  screening: { fullDpiaIndicated: boolean; tiaIndicated: boolean; unresolved: { q: string; reason: string }[]; snapshotId: string | null } | null;
  screeningBlockers: Blocker[];
  fullBlockers: Blocker[];
  assignments: AssignmentView[];
  access: { userId: string; name: string }[];
  people: { owners: PersonView[]; dpos: PersonView[]; assignable: PersonView[]; shareable: PersonView[] };
  screeningDecisions: ScreeningDecisionView[];
  opinions: OpinionView[];
  blocking: BlockingView[];
  ownerDecisions: OwnerDecisionView[];
  conditions: ConditionView[];
  measures: MeasureView[];
  snapshots: SnapshotView[];
  versions: VersionView[];
  events: EventView[];
  /** Subsections of the current version still marked "Carried forward — please review". */
  unreviewed: string[];
}

export interface CommentView {
  id: string;
  authorName: string;
  authorId: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  isReview: boolean;
}

export interface ThreadView {
  id: string;
  subsectionId: string;
  fieldId: string | null;
  recordId: string | null;
  state: "OPEN" | "RESOLVED";
  comments: CommentView[];
}
