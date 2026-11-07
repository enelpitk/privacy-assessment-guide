"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminReassign({ assessmentId, options }: { assessmentId: string; options: { id: string; name: string }[] }) {
  const router = useRouter();
  const [dpo, setDpo] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (options.length === 0) return <p className="help-text mt-2">No other eligible DPO is available.</p>;
  return (
    <details className="mt-2">
      <summary className="w-fit cursor-pointer text-brand-700">Reassign DPO</summary>
      <form
        className="mt-2 grid gap-2 sm:grid-cols-[14rem_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          const res = await fetch(`/api/assessments/${assessmentId}/actions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reassignDpo", newDpoId: dpo, reason }),
          });
          const d = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) return setMsg(d.error ?? "Could not reassign.");
          setMsg("DPO reassigned and recorded in the history.");
          setReason("");
          router.refresh();
        }}
      >
        <label className="text-sm">
          New DPO
          <select className="input mt-1" value={dpo} onChange={(e) => setDpo(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Reason (required)
          <input className="input mt-1" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button className="btn-primary" type="submit" disabled={busy || !dpo || !reason.trim()}>
          Reassign
        </button>
      </form>
      {msg ? (
        <p role="status" className="mt-1 text-sm">
          {msg}
        </p>
      ) : null}
    </details>
  );
}
