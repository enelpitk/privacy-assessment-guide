import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10">
      <div className="card">
        <h1 className="text-xl font-semibold">We could not find that page</h1>
        <p className="mt-2">
          It may not exist, or it may be an assessment you do not have access to as the current demo identity.
        </p>
        <p className="mt-3">
          <Link className="btn-primary" href="/assessments">
            Back to the register
          </Link>
        </p>
      </div>
    </main>
  );
}
