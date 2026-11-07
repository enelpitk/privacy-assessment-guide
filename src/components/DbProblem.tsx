import type { DbProblem } from "@/lib/errors";

export function DbProblemView({ problem }: { problem: DbProblem }) {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10">
      <div role="alert" className="card border-red-300">
        <h1 className="text-xl font-semibold text-red-900">{problem.title}</h1>
        <p className="mt-2">{problem.advice}</p>
        <p className="help-text mt-3">
          No database details or credentials are shown here. Nothing you saved earlier has been lost because of this message.
        </p>
      </div>
    </main>
  );
}
