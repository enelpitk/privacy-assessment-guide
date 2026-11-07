import { redirect, unstable_rethrow } from "next/navigation";
import { DbProblemView } from "@/components/DbProblem";
import { prisma } from "@/lib/db";
import { describeDbProblem } from "@/lib/errors";
import { getCurrentUser } from "@/lib/session";
import { NewAssessmentForm } from "./NewAssessmentForm";

export const dynamic = "force-dynamic";

export default async function NewAssessmentPage() {
  try {
    const user = await getCurrentUser();
    if (!user) redirect("/enter");
    if (!user.roles.includes("OWNER")) {
      return (
        <main id="main" className="mx-auto max-w-2xl px-4 py-8">
          <div className="card">
            <h1 className="text-xl font-semibold">Only process owners can create assessments</h1>
            <p className="mt-2">Switch to a process owner identity to create one.</p>
          </div>
        </main>
      );
    }
    const [depts, dpos] = await Promise.all([
      prisma.department.findMany({ orderBy: { name: "asc" } }),
      prisma.user.findMany({ where: { roles: { has: "DPO" }, id: { not: user.id } }, orderBy: { displayName: "asc" } }),
    ]);
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold">New assessment</h1>
        <p className="help-text mt-1">
          Every new assessment starts with the pre-assessment. Give it a name now; you can change the name later. Use fictional information only.
        </p>
        <NewAssessmentForm
          departments={depts.map((d) => ({ id: d.id, label: `${d.name} (${d.groupEntity})` }))}
          dpos={dpos.map((d) => ({ id: d.id, label: d.displayName }))}
        />
      </main>
    );
  } catch (e) {
    unstable_rethrow(e);
    const p = describeDbProblem(e);
    if (p) return <DbProblemView problem={p} />;
    throw e;
  }
}
