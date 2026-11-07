import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { DbProblemView } from "@/components/DbProblem";
import { ReviewPanel } from "@/components/form/Governance";
import { Shell } from "@/components/form/Shell";
import { describeDbProblem, HttpError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/session";
import { loadPageData } from "@/server/assessments";
import { loadGovernance } from "@/server/governanceData";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await getCurrentUser();
    if (!user) redirect("/enter");
    const [page, gov] = await Promise.all([loadPageData(user, id), loadGovernance(user, id)]);
    return (
      <Shell page={page} current={null}>
        <ReviewPanel gov={gov} />
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
