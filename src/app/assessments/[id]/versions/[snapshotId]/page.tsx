import Link from "next/link";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { DbProblemView } from "@/components/DbProblem";
import { prisma } from "@/lib/db";
import { describeDbProblem, HttpError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/session";
import type { SnapshotPayload } from "@/domain/snapshot";
import { viewSnapshot } from "@/domain/snapshotView";
import { loadAccessible } from "@/server/access";

export const dynamic = "force-dynamic";

const KIND = { SCREENING_SUBMITTED: "Screening snapshot", FULL_SUBMITTED: "Submitted snapshot", FINALISED: "Finalised snapshot" } as const;

export default async function SnapshotPage({ params }: { params: Promise<{ id: string; snapshotId: string }> }) {
  const { id, snapshotId } = await params;
  try {
    const user = await getCurrentUser();
    if (!user) redirect("/enter");
    const { assessment } = await loadAccessible(user, id); // same visibility rule as the assessment
    const snap = await prisma.snapshot.findFirst({ where: { id: snapshotId, assessmentId: id } });
    if (!snap) notFound();
    const payload = snap.payload as unknown as SnapshotPayload;
    const users = await prisma.user.findMany();
    const people = new Map(users.map((u) => [u.id, u.displayName]));
    const sections = viewSnapshot(payload, people);
    const [opinions, decisions, ownerDecisions] = await Promise.all([
      prisma.dpoOpinion.findMany({ where: { assessmentId: id, snapshotId } }),
      prisma.screeningDecision.findMany({ where: { assessmentId: id, snapshotId } }),
      prisma.ownerDecision.findMany({ where: { assessmentId: id, reviewedSnapshotId: snapshotId } }),
    ]);
    return (
      <main id="main" className="mx-auto max-w-4xl px-4 py-6">
        <p className="text-sm">
          <Link className="btn-link" href={`/assessments/${id}/history`}>
            Back to History and versions
          </Link>
        </p>
        <h1 className="mt-2 text-xl font-semibold">
          {KIND[snap.kind as keyof typeof KIND]} — version {payload.versionNumber}
        </h1>
        <p className="help-text mt-1">
          Read-only. Saved {snap.takenAt.toISOString().slice(0, 16).replace("T", " ")} UTC by {people.get(snap.takenById) ?? "unknown"}. Fingerprint {snap.contentHash.slice(0, 12)}. This content can never be
          changed; later edits happen in the current version.
        </p>
        <p className="help-text mt-1" data-testid="snapshot-owners">
          Owner recorded when this snapshot was taken: <strong>{people.get(payload.ownerId) ?? "unknown"}</strong>. Current owner of the assessment:{" "}
          <strong>{people.get(assessment.ownerId) ?? "unknown"}</strong>
          {payload.ownerId !== assessment.ownerId ? " (ownership has been transferred since)." : "."}
        </p>
        {opinions.length || decisions.length || ownerDecisions.length ? (
          <section className="card mt-4 text-sm">
            <h2 className="font-semibold">Recorded against this snapshot</h2>
            <ul className="mt-1 list-disc pl-5">
              {decisions.map((d) => (
                <li key={d.id}>Screening decision ({d.decision}) by {people.get(d.dpoId)}: {d.rationale}</li>
              ))}
              {opinions.map((o) => (
                <li key={o.id}>DPO opinion ({o.category}) by {people.get(o.dpoId)}: {o.opinionText}</li>
              ))}
              {ownerDecisions.map((o) => (
                <li key={o.id}>Owner decision ({o.decision}) by {people.get(o.ownerId)} (owner at the time of the decision): {o.rationale}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="mt-4 space-y-4">
          {sections.map((s) => (
            <section key={s.id} className="card">
              <h2 className="font-semibold">
                {s.label} {s.title}
              </h2>
              <dl className="mt-2 space-y-2 text-sm">
                {s.rows.map((r, i) => (
                  <div key={i}>
                    <dt className="text-ink-soft">{r.label}</dt>
                    <dd className="whitespace-pre-wrap">
                      {r.text || <span className="text-ink-soft">—</span>}
                      {r.state ? <span className="chip-neutral ml-2">{r.state}</span> : null}
                      {r.note ? <span className="block text-ink-soft">Note: {r.note}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </main>
    );
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof HttpError && e.status === 404) notFound();
    const p = describeDbProblem(e);
    if (p) return <DbProblemView problem={p} />;
    throw e;
  }
}
