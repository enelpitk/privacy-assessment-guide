import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { DbProblemView } from "@/components/DbProblem";
import { Overview, Shell } from "@/components/form/Shell";
import { describeDbProblem, HttpError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/session";
import { loadPageData } from "@/server/assessments";

export const dynamic = "force-dynamic";

export default async function AssessmentOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await getCurrentUser();
    if (!user) redirect("/enter");
    const page = await loadPageData(user, id);
    return (
      <Shell page={page} current={null}>
        <Overview />
      </Shell>
    );
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof HttpError && e.status === 404) notFound();
    const p = describeDbProblem(e);
    if (p) return <DbProblemView problem={p} />;
    throw e;
  }
}
