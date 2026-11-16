import type { ScreeningSubmissionInfo } from "@/domain/submissions";

/**
 * Says what happened to a screening submission: withdrawn for editing, superseded because the screening was reopened,
 * and/or a new submission after one of those. Presentational only (no hooks), so it works in server and client components.
 * Renders nothing for an ordinary submission.
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
  /** Review page only: the assessment's screening status, to say what happens next. */
  stillCurrentStatus?: string;
}) {
  if (!info || (!info.withdrawn && !info.reopened && !info.resubmissionOfSnapshotId)) return null;
  const link = (id: string | null, text: string) =>
    id && hrefFor ? (
      <a className="btn-link" href={hrefFor(id)}>
        {text}
      </a>
    ) : (
      <>{text}</>
    );
  const nextIsNew = stillCurrentStatus === "NOT_SUBMITTED" || stillCurrentStatus === "INVALIDATED";
  const replaced = info.replacedBySnapshotId ? <> It was replaced by {link(info.replacedBySnapshotId, "a later submission")}, which is a new submission for the DPO to review.</> : null;
  const next = !info.replacedBySnapshotId && nextIsNew ? " The next submission will be a new submission for the DPO to review." : null;
  const legacy = info.exact ? null : <span className="text-ink-soft"> (Matched by time: this older record does not name the submission.)</span>;
  return (
    <div className="space-y-1" data-testid="screening-submission-note">
      {info.withdrawn ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
          <strong>Withdrawn for editing{info.withdrawnAt ? ` on ${fmt(info.withdrawnAt)}` : ""}.</strong> This submission was not decided and is kept as history; it is no longer under review.
          {replaced}
          {next}
          {legacy}
        </p>
      ) : null}
      {info.reopened ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
          <strong>Superseded: the screening was reopened for changes{info.reopenedAt ? ` on ${fmt(info.reopenedAt)}` : ""}.</strong> The DPO’s decision on this submission is superseded. The submission and the decision are kept as history and no longer apply.
          {replaced}
          {next}
          {legacy}
        </p>
      ) : null}
      {info.resubmissionOfSnapshotId ? (
        <p className="rounded border border-sky-300 bg-sky-50 p-2 text-sky-950">
          <strong>New submission.</strong> The earlier submission was {info.resubmissionAfter === "REOPENED" ? "superseded when the screening was reopened" : "withdrawn for editing"}
          {info.resubmissionOfEndedAt ? ` on ${fmt(info.resubmissionOfEndedAt)}` : ""}.{" "}
          {stillCurrentStatus === "AWAITING_DPO" ? "Only this submission is under review. " : stillCurrentStatus === "DECIDED" ? "The DPO’s decision applies to this submission. " : ""}
          {link(info.resubmissionOfSnapshotId, info.resubmissionAfter === "REOPENED" ? "View the superseded submission" : "View the withdrawn submission")}.
        </p>
      ) : null}
    </div>
  );
}
