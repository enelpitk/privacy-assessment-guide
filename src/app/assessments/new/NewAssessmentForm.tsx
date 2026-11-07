"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Opt {
  id: string;
  label: string;
}

export function NewAssessmentForm({ departments, dpos }: { departments: Opt[]; dpos: Opt[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [dpo, setDpo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length >= 3 && dept && dpo;

  return (
    <form
      className="card mt-4 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/assessments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, departmentId: dept, assignedDpoId: dpo }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data.error ?? "The assessment could not be created.");
            setBusy(false);
            return;
          }
          router.push(`/assessments/${data.id}/s/C0`);
        } catch {
          setError("Network error: could not reach the server. Nothing was created.");
          setBusy(false);
        }
      }}
    >
      <div>
        <label htmlFor="name" className="label">
          Name of the processing
        </label>
        <input id="name" className="input mt-1" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="dept" className="label">
          Department
        </label>
        <select id="dept" className="input mt-1" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">Choose a department…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="dpo" className="label">
          Assigned DPO
        </label>
        <select id="dpo" className="input mt-1" value={dpo} onChange={(e) => setDpo(e.target.value)}>
          <option value="">Choose a DPO…</option>
          {dpos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <p className="help-text mt-1">
          Only this DPO can record the formal review. Other DPO users can view the assessment. You cannot be the DPO of your own assessment.
        </p>
      </div>
      {error ? (
        <p role="alert" className="font-medium text-red-800">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={!ready || busy}>
        Create and start the pre-assessment
      </button>
    </form>
  );
}
