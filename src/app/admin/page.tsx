import { redirect, unstable_rethrow } from "next/navigation";
import { DbProblemView } from "@/components/DbProblem";
import { prisma } from "@/lib/db";
import { describeDbProblem } from "@/lib/errors";
import { LIFECYCLE_LABEL } from "@/lib/labels";
import { getCurrentUser } from "@/lib/session";
import { AdminReassign } from "./AdminReassign";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    const user = await getCurrentUser();
    if (!user) redirect("/enter");
    if (!user.roles.includes("ADMIN")) {
      return (
        <main id="main" className="mx-auto max-w-2xl px-4 py-8">
          <div className="card">
            <h1 className="text-lg font-semibold">Demo administrator only</h1>
            <p className="mt-2">Switch to the demo administrator identity to use this page.</p>
          </div>
        </main>
      );
    }
    const [assessments, dpos] = await Promise.all([
      prisma.assessment.findMany({ include: { owner: true, assignedDpo: true }, orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.user.findMany({ where: { roles: { has: "DPO" } }, orderBy: { displayName: "asc" } }),
    ]);
    return (
      <main id="main" className="mx-auto max-w-[88rem] px-4 py-6">
        <h1 className="text-xl font-semibold">Demo administration</h1>
        <p className="help-text mt-1">
          Reassign the assigned DPO of an assessment. A reason is required and the change is recorded in the assessment’s history with the previous and new DPO. Earlier decisions and
          opinions keep their original authors, and a pending review moves to the new DPO. An owner can never be the DPO of their own assessment.
        </p>
        <ul className="mt-4 space-y-3">
          {assessments.map((a) => (
            <li key={a.id} className="card text-sm">
              <p className="font-medium">
                {a.name} <span className="text-ink-soft">({a.displayId})</span>
              </p>
              <p className="text-ink-soft">
                Owner: {a.owner.displayName} · DPO: {a.assignedDpo.displayName} · {LIFECYCLE_LABEL[a.lifecycle] ?? a.lifecycle}
              </p>
              <AdminReassign
                assessmentId={a.id}
                options={dpos.filter((d) => d.id !== a.ownerId && d.id !== a.assignedDpoId).map((d) => ({ id: d.id, name: d.displayName }))}
              />
            </li>
          ))}
          {assessments.length === 0 ? <li className="text-ink-soft">No assessments yet.</li> : null}
        </ul>
      </main>
    );
  } catch (e) {
    unstable_rethrow(e);
    const p = describeDbProblem(e);
    if (p) return <DbProblemView problem={p} />;
    throw e;
  }
}
