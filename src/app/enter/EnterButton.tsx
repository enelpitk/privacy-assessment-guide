"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EnterButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/demo/enter", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            });
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              setError(d.error ?? "Could not enter the demo.");
              setBusy(false);
              return;
            }
            router.push("/assessments");
            router.refresh();
          } catch {
            setError("Network error: could not reach the server.");
            setBusy(false);
          }
        }}
      >
        Enter demo as {name}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
