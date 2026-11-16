import type { ScreeningSubmissionInfo } from "@/domain/submissions";

/**
 * Says what happened to a screening submission: withdrawn for editing, and/or a new submission after a withdrawal.
 * Presentational only (no hooks), so it works in server and client components. Renders nothing for an ordinary submission.
 */
export function ScreeningSubmissionNote({
  info,
  fmt,
  hrefFor,
  stillCurrentStatus,
}: {
  info: ScreeningSubmissionInfo | undefined;
  fmt: (iso: string) => string;
  hrefFor?: (snapshotId: string) => string;
  /** Review page only: the assessment's screening status, to say what happens next after a withdrawal. */
  stillCurrentStatus?: string;
}) {
  if (!info || (!info.withdrawn && !info.resubmissionOfSnapshotId)) return null;
  const link = (id: string | null, text: string) => (id && hrefFor ? (
    <a className="btn-link" href={hrefFor(id)}>
      {text}
    </a>
  ) : (
    <>{text}</>
  ));
  return (
    <div className="space-y-1" data-testid="screening-submission-note">
      {info.withdrawn ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
          <strong>Withdrawn for editing{info.withdrawnAt ? ` on ${fmt(info.withdrawnAt)}` : ""}.</strong> This submission was not decided and is kept as history; it is no longer under review.
          {info.replacedBySnapshotId ? <> It was replaced by {link(info.replacedBySnapshotId, "a later submission")}, which is a new submission for the DPO to review.</> : null}
          {!info.replacedBySnapshotId && stillCurrentStatus === "NOT_SUBMITTED" ? " The next submission will be a new submission for the DPO to review." : null}
          {info.exact ? null : <span className="text-ink-soft"> (Matched by time: this older withdrawal record does not name the submission.)</span>}
        </p>
      ) : null}
      {info.resubmissionOfSnapshotId ? (
        <p className="rounded border border-sky-300 bg-sky-50 p-2 text-sky-950">
          <strong>New submission.</strong> The earlier submission was withdrawn for editing{info.resubmissionOfWithdrawnAt ? ` on ${fmt(info.resubmissionOfWithdrawnAt)}` : ""}.{" "}
          Only this submission is under review. {link(info.resubmissionOfSnapshotId, "View the withdrawn submission")}.
        </p>
      ) : null}
    </div>
  );
}
