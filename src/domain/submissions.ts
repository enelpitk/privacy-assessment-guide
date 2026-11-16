// Relationships between screening submissions, derived from existing snapshots and events.
// Pure: nothing is stored and no snapshot is ever modified. A submission stops being current in one of two ways:
//   WITHDRAWN: the owner withdrew it for editing while it was awaiting the DPO;
//   REOPENED:  the DPO had decided it and the owner reopened the screening (the decision is then superseded).
// A later screening snapshot of the same version is a new, separately reviewable submission.

export interface SubmissionSnapshot {
  id: string;
  kind: string;
  versionId: string;
  /** ISO time. */
  takenAt: string;
}

export interface SubmissionEvent {
  type: string;
  /** Null on events recorded without a version: matched by time across versions. */
  versionId: string | null;
  /** ISO time. */
  createdAt: string;
  payload: Record<string, unknown> | null;
}

export type SubmissionEnd = "WITHDRAWN" | "REOPENED";

export interface ScreeningSubmissionInfo {
  /** The owner withdrew the screening while this submission was awaiting the DPO. */
  withdrawn: boolean;
  withdrawnAt: string | null;
  /** The screening was reopened for changes after the DPO had decided this submission (its decision is superseded). */
  reopened: boolean;
  reopenedAt: string | null;
  /** The later screening snapshot of the same version that replaced this submission. */
  replacedBySnapshotId: string | null;
  /** The earlier submission this one follows (this is then a new submission), and how that one ended. */
  resubmissionOfSnapshotId: string | null;
  resubmissionAfter: SubmissionEnd | null;
  resubmissionOfEndedAt: string | null;
  /** True when the event carried the snapshot id; false when it was matched by time (older events). */
  exact: boolean;
}

export const SUBMISSION_EVENT_TYPES = ["SCREENING_WITHDRAWN", "SCREENING_REOPENED"];

const t = (iso: string) => new Date(iso).getTime();

/** Keyed by screening snapshot id. Only screening snapshots appear in the result. */
export function deriveScreeningSubmissions(snapshots: SubmissionSnapshot[], events: SubmissionEvent[]): Record<string, ScreeningSubmissionInfo> {
  const screening = snapshots.filter((s) => s.kind === "SCREENING_SUBMITTED").sort((a, b) => t(a.takenAt) - t(b.takenAt));
  const info: Record<string, ScreeningSubmissionInfo> = {};
  const endedAs: Record<string, SubmissionEnd> = {};
  for (const s of screening) {
    info[s.id] = {
      withdrawn: false,
      withdrawnAt: null,
      reopened: false,
      reopenedAt: null,
      replacedBySnapshotId: null,
      resubmissionOfSnapshotId: null,
      resubmissionAfter: null,
      resubmissionOfEndedAt: null,
      exact: false,
    };
  }

  const ends = events.filter((e) => SUBMISSION_EVENT_TYPES.includes(e.type)).sort((a, b) => t(a.createdAt) - t(b.createdAt));
  for (const w of ends) {
    const inVersion = screening.filter((s) => w.versionId === null || s.versionId === w.versionId);
    const named = typeof w.payload?.snapshotId === "string" ? inVersion.find((s) => s.id === w.payload!.snapshotId) : undefined;
    // Older events have no snapshot id: the submission is the latest one taken before the event.
    const target = named ?? [...inVersion].reverse().find((s) => t(s.takenAt) <= t(w.createdAt));
    if (!target || endedAs[target.id]) continue;
    const kind: SubmissionEnd = w.type === "SCREENING_WITHDRAWN" ? "WITHDRAWN" : "REOPENED";
    endedAs[target.id] = kind;
    if (kind === "WITHDRAWN") {
      info[target.id].withdrawn = true;
      info[target.id].withdrawnAt = w.createdAt;
    } else {
      info[target.id].reopened = true;
      info[target.id].reopenedAt = w.createdAt;
    }
    info[target.id].exact = Boolean(named);
  }

  // An ended submission is replaced by the next screening snapshot of the same version taken after it ended.
  for (const s of screening) {
    const kind = endedAs[s.id];
    if (!kind) continue;
    const endedAt = (kind === "WITHDRAWN" ? info[s.id].withdrawnAt : info[s.id].reopenedAt)!;
    const next = screening.find((x) => x.versionId === s.versionId && t(x.takenAt) > t(s.takenAt) && t(x.takenAt) >= t(endedAt));
    if (!next) continue;
    info[s.id].replacedBySnapshotId = next.id;
    info[next.id].resubmissionOfSnapshotId = s.id;
    info[next.id].resubmissionAfter = kind;
    info[next.id].resubmissionOfEndedAt = endedAt;
  }
  return info;
}
