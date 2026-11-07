import { redirect, unstable_rethrow } from "next/navigation";
import { DbProblemView } from "@/components/DbProblem";
import { describeDbProblem } from "@/lib/errors";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const user = await getCurrentUser();
    redirect(user ? "/assessments" : "/enter");
  } catch (e) {
    unstable_rethrow(e);
    const p = describeDbProblem(e);
    if (p) return <DbProblemView problem={p} />;
    throw e;
  }
}
