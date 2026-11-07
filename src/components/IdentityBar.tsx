"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function IdentityBar({ name, roles }: { name: string; roles: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span>
        Demo identity: <strong>{name}</strong> <span className="text-ink-soft">({roles})</span>
      </span>
      <Link className="btn-link" href="/enter">
        Switch identity
      </Link>
      <button
        type="button"
        className="btn-link"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/demo/leave", { method: "POST" });
          router.push("/enter");
          router.refresh();
        }}
      >
        Leave demo
      </button>
    </div>
  );
}
