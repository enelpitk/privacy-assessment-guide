"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10">
      <div role="alert" className="card border-red-300">
        <h1 className="text-xl font-semibold text-red-900">Something went wrong</h1>
        <p className="mt-2">
          The page could not be shown. Your saved answers are not affected. Try again; if it keeps happening, check the deployment logs.
        </p>
        <button type="button" className="btn-primary mt-3" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
