import { describe, expect, it } from "vitest";
import { deriveScreeningSubmissions } from "@/domain/submissions";

const snap = (id: string, takenAt: string, versionId = "v1", kind = "SCREENING_SUBMITTED") => ({ id, kind, versionId, takenAt });
const wd = (createdAt: string, snapshotId?: string, versionId: string | null = "v1") => ({ type: "SCREENING_WITHDRAWN", versionId, createdAt, payload: snapshotId ? { snapshotId } : null });

describe("deriving withdrawn and resubmitted screening submissions", () => {
  it("an ordinary submission is neither withdrawn nor a resubmission", () => {
    const r = deriveScreeningSubmissions([snap("s1", "2026-11-08T10:00:00Z")], []);
    expect(r.s1).toMatchObject({ withdrawn: false, replacedBySnapshotId: null, resubmissionOfSnapshotId: null });
  });

  it("a withdrawal that names the snapshot marks exactly that submission, and the next one is a new submission", () => {
    const r = deriveScreeningSubmissions(
      [snap("s1", "2026-11-08T10:00:00Z"), snap("s2", "2026-11-08T12:00:00Z")],
      [wd("2026-11-08T11:00:00Z", "s1")],
    );
    expect(r.s1).toMatchObject({ withdrawn: true, withdrawnAt: "2026-11-08T11:00:00Z", replacedBySnapshotId: "s2", exact: true });
    expect(r.s2).toMatchObject({ withdrawn: false, resubmissionOfSnapshotId: "s1", resubmissionOfEndedAt: "2026-11-08T11:00:00Z" });
  });

  it("an older withdrawal event without a snapshot id is matched by time to the latest earlier submission", () => {
    const r = deriveScreeningSubmissions(
      [snap("s1", "2026-11-08T10:00:00Z"), snap("s2", "2026-11-08T12:00:00Z")],
      [wd("2026-11-08T11:00:00Z")], // no payload: legacy
    );
    expect(r.s1).toMatchObject({ withdrawn: true, replacedBySnapshotId: "s2", exact: false });
    expect(r.s2).toMatchObject({ withdrawn: false, resubmissionOfSnapshotId: "s1" });
  });

  it("a withdrawal with no later submission leaves the submission withdrawn and unreplaced", () => {
    const r = deriveScreeningSubmissions([snap("s1", "2026-11-08T10:00:00Z")], [wd("2026-11-08T11:00:00Z", "s1")]);
    expect(r.s1).toMatchObject({ withdrawn: true, replacedBySnapshotId: null });
  });

  it("several cycles chain correctly: s1 withdrawn, s2 withdrawn, s3 current", () => {
    const r = deriveScreeningSubmissions(
      [snap("s1", "2026-11-08T10:00:00Z"), snap("s2", "2026-11-08T12:00:00Z"), snap("s3", "2026-11-08T14:00:00Z")],
      [wd("2026-11-08T11:00:00Z", "s1"), wd("2026-11-08T13:00:00Z")], // the second is a legacy event
    );
    expect(r.s1).toMatchObject({ withdrawn: true, replacedBySnapshotId: "s2" });
    expect(r.s2).toMatchObject({ withdrawn: true, replacedBySnapshotId: "s3", resubmissionOfSnapshotId: "s1", exact: false });
    expect(r.s3).toMatchObject({ withdrawn: false, resubmissionOfSnapshotId: "s2" });
  });

  it("versions are kept apart, and only screening snapshots are described", () => {
    const r = deriveScreeningSubmissions(
      [snap("a1", "2026-11-08T10:00:00Z", "v1"), snap("full", "2026-11-08T10:30:00Z", "v1", "FULL_SUBMITTED"), snap("b1", "2026-11-09T10:00:00Z", "v2")],
      [wd("2026-11-08T11:00:00Z", undefined, "v1")],
    );
    expect(Object.keys(r).sort()).toEqual(["a1", "b1"]);
    expect(r.a1.withdrawn).toBe(true);
    expect(r.a1.replacedBySnapshotId).toBeNull(); // v2's submission does not replace v1's
    expect(r.b1).toMatchObject({ withdrawn: false, resubmissionOfSnapshotId: null });
  });

  it("an event naming an unknown snapshot falls back to time, and an event before any submission is ignored", () => {
    const r = deriveScreeningSubmissions([snap("s1", "2026-11-08T10:00:00Z")], [wd("2026-11-08T11:00:00Z", "gone"), wd("2026-11-08T09:00:00Z")]);
    expect(r.s1).toMatchObject({ withdrawn: true, exact: false });
  });

  it("a reopened screening marks the decided submission as reopened (superseded) and the next one as a new submission after reopening", () => {
    const re = (createdAt: string, snapshotId?: string, versionId: string | null = "v1") => ({ type: "SCREENING_REOPENED", versionId, createdAt, payload: snapshotId ? { snapshotId, previousPath: "FULL" } : { previousPath: "FULL" } });
    const r = deriveScreeningSubmissions(
      [snap("s1", "2026-11-08T10:00:00Z"), snap("s2", "2026-11-08T14:00:00Z")],
      [re("2026-11-08T12:00:00Z", "s1")],
    );
    expect(r.s1).toMatchObject({ reopened: true, reopenedAt: "2026-11-08T12:00:00Z", withdrawn: false, replacedBySnapshotId: "s2", exact: true });
    expect(r.s2).toMatchObject({ reopened: false, resubmissionOfSnapshotId: "s1", resubmissionAfter: "REOPENED", resubmissionOfEndedAt: "2026-11-08T12:00:00Z" });
  });

  it("an older reopening event without a snapshot id is matched by time", () => {
    const r = deriveScreeningSubmissions([snap("s1", "2026-11-08T10:00:00Z")], [{ type: "SCREENING_REOPENED", versionId: "v1", createdAt: "2026-11-08T12:00:00Z", payload: { previousPath: "FULL" } }]);
    expect(r.s1).toMatchObject({ reopened: true, exact: false, replacedBySnapshotId: null });
  });

  it("withdrawals and a reopening chain: s1 withdrawn, s2 decided then reopened, s3 current", () => {
    const r = deriveScreeningSubmissions(
      [snap("s1", "2026-11-08T10:00:00Z"), snap("s2", "2026-11-08T12:00:00Z"), snap("s3", "2026-11-08T16:00:00Z")],
      [wd("2026-11-08T11:00:00Z", "s1"), { type: "SCREENING_REOPENED", versionId: "v1", createdAt: "2026-11-08T14:00:00Z", payload: { snapshotId: "s2" } }],
    );
    expect(r.s1).toMatchObject({ withdrawn: true, reopened: false, replacedBySnapshotId: "s2" });
    expect(r.s2).toMatchObject({ withdrawn: false, reopened: true, replacedBySnapshotId: "s3", resubmissionAfter: "WITHDRAWN" });
    expect(r.s3).toMatchObject({ resubmissionAfter: "REOPENED", resubmissionOfSnapshotId: "s2" });
  });

  it("a snapshot ends only once: a later event does not re-mark it", () => {
    const r = deriveScreeningSubmissions(
      [snap("s1", "2026-11-08T10:00:00Z")],
      [wd("2026-11-08T11:00:00Z", "s1"), { type: "SCREENING_REOPENED", versionId: "v1", createdAt: "2026-11-08T12:00:00Z", payload: { snapshotId: "s1" } }],
    );
    expect(r.s1).toMatchObject({ withdrawn: true, reopened: false });
  });
});
