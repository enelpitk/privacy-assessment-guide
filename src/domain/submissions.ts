// Relationships between screening submissions, derived from existing snapshots and events.
// Pure: nothing is stored and no snapshot is ever modified. A snapshot is "withdrawn" when the owner
// withdrew the screening while that submission was with the DPO; a later screening snapshot of the same
// version is then a new, separately reviewable submission.

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

export interface ScreeningSubmissionInfo {
  /** The owner withdrew the screening while this submission was awaiting the DPO. */
  withdrawn: boolean;
  withdrawnAt: string | null;
  /** The later screening snapshot of the same version that replaced this withdrawn submission. */
  replacedBySnapshotId: string | null;
  /** The earlier withdrawn submission this one follows (this is then a new submission). */
  resubmissionOfSnapshotId: string | null;
  resubmissionOfWithdrawnAt: string | null;
  /** True when the withdrawal event carried the snapshot id; false when it was matched by time (older events). */
  exact: boolean;
}

const t = (iso: string) => new Date(iso).getTime();

/** Keyed by screening snapshot id. Only screening snapshots appear in the result. */
export function deriveScreeningSubmissions(snapshots: SubmissionSnapshot[], events: SubmissionEvent[]): Record<string, ScreeningSubmissionInfo> {
  const screening = snapshots.filter((s) => s.kind === "SCREENING_SUBMITTED").sort((a, b) => t(a.takenAt) - t(b.takenAt));
  const info: Record<string, ScreeningSubmissionInfo> = {};
  for (const s of screening) {
    info[s.id] = { withdrawn: false, withdrawnAt: null, replacedBySnapshotId: null, resubmissionOfSnapshotId: null, resubmissionOfWithdrawnAt: null, exact: false };
  }

  const withdrawals = events.filter((e) => e.type === "SCREENING_WITHDRAWN").sort((a, b) => t(a.createdAt) - t(b.createdAt));
  for (const w of withdrawals) {
    const inVersion = screening.filter((s) => w.versionId === null || s.versionId === w.versionId);
    const named = typeof w.payload?.snapshotId === "string" ? inVersion.find((s) => s.id === w.payload!.snapshotId) : undefined;
    // Older events have no snapshot id: the withdrawn submission is the latest one taken before the withdrawal.
    const target = named ?? [...inVersion].reverse().find((s) => t(s.takenAt) <= t(w.createdAt));
    if (!target || info[target.id].withdrawn) continue;
    info[target.id].withdrawn = true;
    info[target.id].withdrawnAt = w.createdAt;
    info[target.id].exact = Boolean(named);
  }

  // A withdrawn submission is replaced by the next screening snapshot of the same version taken after the withdrawal.
  for (const s of screening) {
    const i = info[s.id];
    if (!i.withdrawn || !i.withdrawnAt) continue;
    const next = screening.find((x) => x.versionId === s.versionId && t(x.takenAt) > t(s.takenAt) && t(x.takenAt) >= t(i.withdrawnAt!));
    if (!next) continue;
    i.replacedBySnapshotId = next.id;
    info[next.id].resubmissionOfSnapshotId = s.id;
    info[next.id].resubmissionOfWithdrawnAt = i.withdrawnAt;
  }
  return info;
}
