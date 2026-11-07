import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { DbProblemView } from "@/components/DbProblem";
import { Shell } from "@/components/form/Shell";
import { SubsectionForm } from "@/components/form/SubsectionForm";
import { subsectionById } from "@/content";
import { describeDbProblem, HttpError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/session";
import { loadPageData } from "@/server/assessments";

export const dynamic = "force-dynamic";

export default async function SubsectionPage({ params }: { params: Promise<{ id: string; sub: string }> }) {
  const { id, sub } = await params;
  if (!subsectionById.has(sub)) notFound();
  try {
    const user = await getCurrentUser();
    if (!user) redirect("/enter");
    const page = await loadPageData(user, id);
    return (
      <Shell page={page} current={sub}>
        <SubsectionForm key={sub} subsectionId={sub} />
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
