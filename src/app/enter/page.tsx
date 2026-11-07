import { unstable_rethrow } from "next/navigation";
import { DbProblemView } from "@/components/DbProblem";
import { EnterButton } from "./EnterButton";
import { prisma } from "@/lib/db";
import { describeDbProblem } from "@/lib/errors";
import { ROLE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function EnterPage() {
  try {
    const users = await prisma.user.findMany({ include: { department: true }, orderBy: { displayName: "asc" } });
    return (
      <main id="main" className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Enter demo as…</h1>
        <div className="card mt-4 border-amber-300 bg-amber-50">
          <h2 className="font-semibold">This is not secure sign-in</h2>
          <p className="mt-1 text-sm">
            There are no passwords, no email checks and no real invitations. Anyone using this demo may choose any identity below. The server still applies each identity’s
            workflow permissions, but that is not identity authentication. A real deployment would need proper authentication.
          </p>
          <p className="mt-1 text-sm">All people, departments and organisations here are fictional. Use fictional information only.</p>
        </div>

        {users.length === 0 ? (
          <div role="status" className="card mt-6">
            <h2 className="font-semibold">No demo users yet</h2>
            <p className="mt-1 text-sm">
              The demo users have not been added to this database. They are added by an explicit one-time seed step (see docs/deployment.md), never automatically.
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {users.map((u) => (
              <li key={u.id} className="card flex flex-col justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{u.displayName}</h2>
                  <p className="text-sm text-ink-soft">{u.jobTitle}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {u.roles.map((r) => (
                      <span key={r} className="chip-neutral">
                        {ROLE_LABEL[r] ?? r}
                      </span>
                    ))}
                  </p>
                  {u.department ? (
                    <p className="help-text mt-1">
                      {u.department.name} ({u.department.groupEntity})
                    </p>
                  ) : null}
                </div>
                <EnterButton userId={u.id} name={u.displayName} />
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  } catch (e) {
    unstable_rethrow(e);
    const p = describeDbProblem(e);
    if (p) return <DbProblemView problem={p} />;
    throw e;
  }
}
