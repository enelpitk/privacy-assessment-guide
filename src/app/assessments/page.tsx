import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { DbProblemView } from "@/components/DbProblem";
import { prisma } from "@/lib/db";
import { describeDbProblem } from "@/lib/errors";
import { LIFECYCLE_LABEL, SCREENING_LABEL } from "@/lib/labels";
import { getCurrentUser } from "@/lib/session";
import { listAssessments, type RegisterView } from "@/server/assessments";

export const dynamic = "force-dynamic";

const VIEWS: { id: RegisterView; label: string }[] = [
  { id: "mine", label: "My assessments" },
  { id: "assigned", label: "Assigned to me" },
  { id: "awaiting", label: "Awaiting DPO review" },
  { id: "reviewdue", label: "Review due" },
  { id: "all", label: "All assessments" },
];

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => (typeof sp[k] === "string" && sp[k] !== "" ? (sp[k] as string) : undefined);

export default async function RegisterPage({ searchParams }: { searchParams: Promise<SP> }) {
  try {
    const sp = await searchParams;
    const user = await getCurrentUser();
    if (!user) redirect("/enter");
    const isOwner = user.roles.includes("OWNER");
    const requested = one(sp, "view") as RegisterView | undefined;
    const view: RegisterView = VIEWS.some((v) => v.id === requested) ? requested! : isOwner ? "mine" : "all";
    const archived = one(sp, "archived") === "1";
    const filters = {
      view,
      q: one(sp, "q"),
      ownerId: one(sp, "owner"),
      departmentId: one(sp, "dept"),
      status: one(sp, "status"),
      reviewFrom: one(sp, "from"),
      reviewTo: one(sp, "to"),
      archived,
    };
    const [rows, owners, depts] = await Promise.all([
      listAssessments(user, filters),
      prisma.user.findMany({ where: { roles: { has: "OWNER" } }, orderBy: { displayName: "asc" } }),
      prisma.department.findMany({ orderBy: { name: "asc" } }),
    ]);
    const href = (v: RegisterView) => `/assessments?view=${v}${archived ? "&archived=1" : ""}`;

    return (
      <main id="main" className="mx-auto max-w-[88rem] px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Assessment register</h1>
          {isOwner ? (
            <Link className="btn-primary" href="/assessments/new">
              New assessment
            </Link>
          ) : null}
        </div>
        <p className="help-text mt-1">
          You see the assessments you own or are assigned to. DPO users see all demo assessments. “All assessments” means all that are visible to you.
        </p>

        <nav aria-label="Register views" className="mt-4 flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v.id}
              href={href(v.id)}
              aria-current={v.id === view ? "page" : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${v.id === view ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white hover:bg-slate-100"}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>

        <form method="get" className="card mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter assessments">
          <input type="hidden" name="view" value={view} />
          <div className="sm:col-span-2">
            <label className="label text-sm" htmlFor="q">
              Search name or identifier
            </label>
            <input id="q" name="q" className="input" defaultValue={filters.q ?? ""} />
          </div>
          <div>
            <label className="label text-sm" htmlFor="owner">
              Owner
            </label>
            <select id="owner" name="owner" className="input" defaultValue={filters.ownerId ?? ""}>
              <option value="">Any owner</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-sm" htmlFor="dept">
              Department
            </label>
            <select id="dept" name="dept" className="input" defaultValue={filters.departmentId ?? ""}>
              <option value="">Any department</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.groupEntity})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-sm" htmlFor="status">
              Status
            </label>
            <select id="status" name="status" className="input" defaultValue={filters.status ?? ""}>
              <option value="">Any status</option>
              {Object.entries(LIFECYCLE_LABEL)
                .filter(([k]) => k !== "ARCHIVED")
                .map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label text-sm" htmlFor="from">
              Next review from
            </label>
            <input id="from" name="from" type="date" className="input" defaultValue={filters.reviewFrom ?? ""} />
          </div>
          <div>
            <label className="label text-sm" htmlFor="to">
              Next review to
            </label>
            <input id="to" name="to" type="date" className="input" defaultValue={filters.reviewTo ?? ""} />
          </div>
          <div className="flex items-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="archived" value="1" className="h-5 w-5" defaultChecked={archived} />
              Show archived only
            </label>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button className="btn-primary" type="submit">
              Apply filters
            </button>
            <Link className="btn-secondary" href={`/assessments?view=${view}`}>
              Clear filters
            </Link>
          </div>
        </form>

        <p className="mt-4 text-sm" role="status">
          {rows.length} assessment{rows.length === 1 ? "" : "s"} shown.
        </p>

        {rows.length === 0 ? (
          <div className="card mt-3">
            <p>No assessments match this view.</p>
            {isOwner ? (
              <p className="help-text mt-1">
                Start one with “New assessment”. Every new assessment begins with the pre-assessment.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="w-full border-collapse bg-white text-left text-sm">
                <caption className="sr-only">Assessments</caption>
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-100">
                    <th scope="col" className="p-2">Assessment</th>
                    <th scope="col" className="p-2">Department</th>
                    <th scope="col" className="p-2">Owner</th>
                    <th scope="col" className="p-2">Status</th>
                    <th scope="col" className="p-2">Version</th>
                    <th scope="col" className="p-2">Last modified</th>
                    <th scope="col" className="p-2">Next review</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-200 align-top">
                      <td className="p-2">
                        <Link className="btn-link" href={`/assessments/${r.id}`}>
                          {r.name}
                        </Link>
                        <span className="help-text block">{r.displayId}</span>
                      </td>
                      <td className="p-2">
                        {r.department}
                        <span className="help-text block">{r.groupEntity}</span>
                      </td>
                      <td className="p-2">{r.ownerName}</td>
                      <td className="p-2">
                        <span className="chip-neutral">{LIFECYCLE_LABEL[r.lifecycle] ?? r.lifecycle}</span>
                        <span className="help-text mt-1 block">{SCREENING_LABEL[r.screeningStatus]}</span>
                      </td>
                      <td className="p-2">{r.versionNumber}</td>
                      <td className="p-2">{new Date(r.updatedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}</td>
                      <td className="p-2">{r.nextReviewDate ?? "Not set"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-3 space-y-3 md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="card">
                  <Link className="btn-link text-base" href={`/assessments/${r.id}`}>
                    {r.name}
                  </Link>
                  <p className="help-text">{r.displayId}</p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-ink-soft">Department</dt>
                    <dd>
                      {r.department} ({r.groupEntity})
                    </dd>
                    <dt className="text-ink-soft">Owner</dt>
                    <dd>{r.ownerName}</dd>
                    <dt className="text-ink-soft">Status</dt>
                    <dd>{LIFECYCLE_LABEL[r.lifecycle] ?? r.lifecycle}</dd>
                    <dt className="text-ink-soft">Version</dt>
                    <dd>{r.versionNumber}</dd>
                    <dt className="text-ink-soft">Modified</dt>
                    <dd>{new Date(r.updatedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}</dd>
                    <dt className="text-ink-soft">Next review</dt>
                    <dd>{r.nextReviewDate ?? "Not set"}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </>
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
