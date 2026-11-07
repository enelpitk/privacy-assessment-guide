"use client";

import { useState } from "react";
import { canChangeRecords } from "@/domain/permissions";
import {
  RISK_EXAMPLES,
  buildRisks,
  consultationPrompt,
  matrixCells,
  type MatrixMode,
  type RiskView,
  type Score,
} from "@/domain/riskSummary";
import { useStoreCtx, useStoreRev } from "./context";
import { useModel } from "./useModel";

const CAT_CLASS = { LOW: "chip-good", MEDIUM: "chip-warn", HIGH: "chip-bad" } as const;
const STATUS_TEXT: Record<string, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETED: "Completed" };

function ScoreCell({ s }: { s: Score | null }) {
  if (!s) return <span className="text-ink-soft">Not assessed</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <strong>{s.score}</strong> <span className={CAT_CLASS[s.category]}>{s.category}</span>
    </span>
  );
}

const riskName = (r: RiskView) => r.name.trim() || "(unnamed risk)";

export function RiskSummary() {
  const model = useModel();
  const risks = buildRisks(model);
  const [mode, setMode] = useState<MatrixMode>("residual");
  const overdue = risks.flatMap((r) => r.measures.filter((m) => m.overdue).map((m) => ({ r, m })));
  const high = consultationPrompt(risks);
  const notAssessed = risks.filter((r) => !r.inherent || !r.residual).length;
  const cells = matrixCells(risks, mode);
  const modeLabel = { inherent: "Inherent risk", residual: "Current residual risk", target: "Target risk (after planned measures)" }[mode];

  return (
    <div className="space-y-4">
      <p className="text-sm" role="status">
        <strong>{risks.length}</strong> risk{risks.length === 1 ? "" : "s"} recorded; <strong>{high.length}</strong> with HIGH current residual risk; <strong>{notAssessed}</strong>{" "}
        not fully assessed. Scores are calculated as probability × impact; a missing score is shown as “Not assessed”, never zero.
      </p>

      {risks.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="mb-1 text-left font-semibold">Risk register</caption>
              <thead>
                <tr className="border-b border-slate-300">
                  <th scope="col" className="py-1 pr-3">#</th>
                  <th scope="col" className="py-1 pr-3">Risk</th>
                  <th scope="col" className="py-1 pr-3">Inherent</th>
                  <th scope="col" className="py-1 pr-3">Current residual</th>
                  <th scope="col" className="py-1 pr-3">Target (planned)</th>
                  <th scope="col" className="py-1">Measures</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.recordId} className="border-b border-slate-200 align-top">
                    <th scope="row" className="py-1 pr-3">R{r.number}</th>
                    <td className="py-1 pr-3">{riskName(r)}</td>
                    <td className="py-1 pr-3"><ScoreCell s={r.inherent} /></td>
                    <td className="py-1 pr-3"><ScoreCell s={r.residual} /></td>
                    <td className="py-1 pr-3">{r.target ? <ScoreCell s={r.target} /> : <span className="text-ink-soft">Not set</span>}</td>
                    <td className="py-1">
                      {r.measures.length} ({r.measures.filter((m) => m.status === "COMPLETED").length} completed)
                      {r.measures.some((m) => m.overdue) ? <span className="chip-bad ml-1">Overdue</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {risks.map((r) => (
              <li key={r.recordId} className="card text-sm">
                <p className="font-medium">R{r.number} · {riskName(r)}</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="text-ink-soft">Inherent</dt><dd><ScoreCell s={r.inherent} /></dd>
                  <dt className="text-ink-soft">Current residual</dt><dd><ScoreCell s={r.residual} /></dd>
                  <dt className="text-ink-soft">Target</dt><dd>{r.target ? <ScoreCell s={r.target} /> : "Not set"}</dd>
                  <dt className="text-ink-soft">Measures</dt><dd>{r.measures.length} ({r.measures.filter((m) => m.status === "COMPLETED").length} completed)</dd>
                </dl>
              </li>
            ))}
          </ul>

          <fieldset>
            <legend className="text-sm font-semibold">Risk matrix – show</legend>
            <div className="mt-1 flex flex-wrap gap-4 text-sm">
              {(["inherent", "residual", "target"] as const).map((m) => (
                <label key={m} className="inline-flex items-center gap-2">
                  <input type="radio" name="matrix-mode" className="h-4 w-4" checked={mode === m} onChange={() => setMode(m)} />
                  {m === "inherent" ? "Inherent" : m === "residual" ? "Current residual" : "Target"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="overflow-x-auto">
            <table className="min-w-[30rem] border-collapse text-center text-sm">
              <caption className="mb-1 text-left font-semibold">{modeLabel} – matrix (impact × probability)</caption>
              <thead>
                <tr>
                  <th className="p-1 text-left">Impact ↓ / Probability →</th>
                  {[1, 2, 3, 4].map((p) => (
                    <th key={p} scope="col" className="border border-slate-300 p-1">Probability {p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[4, 3, 2, 1].map((i) => (
                  <tr key={i}>
                    <th scope="row" className="border border-slate-300 p-1 text-left">Impact {i}</th>
                    {[1, 2, 3, 4].map((p) => {
                      const sc = p * i;
                      const cat = sc <= 4 ? "LOW" : sc <= 8 ? "MEDIUM" : "HIGH";
                      const here = cells.get(`${p},${i}`) ?? [];
                      return (
                        <td key={p} className={`border border-slate-300 p-1.5 align-top ${cat === "HIGH" ? "bg-red-50" : cat === "MEDIUM" ? "bg-amber-50" : "bg-emerald-50"}`}>
                          <span className="block font-semibold">{sc} {cat}</span>
                          {here.length ? (
                            <span className="mt-0.5 block text-xs">
                              {here.map((r) => `R${r.number}`).join(", ")}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="help-text">
            Categories are written out as well as coloured. Risks that are not assessed yet are not plotted. {risks.map((r) => `R${r.number} = ${riskName(r)}`).join("; ")}.
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-soft">No risks recorded yet. Add one below, manually or from an example.</p>
      )}

      {high.length ? (
        <p role="status" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-950">
          <strong>Current residual risk is HIGH for {high.map((r) => `R${r.number}`).join(", ")}.</strong> Document additional actions and a specialist review. The template
          says supervisory authority consultation is required if residual risks remain HIGH after mitigation and cannot be reduced further. The DPO and owner decide this; the
          score alone does not.
        </p>
      ) : null}

      {overdue.length ? (
        <div role="status" className="rounded border border-amber-400 bg-amber-50 p-2 text-sm">
          <p className="font-semibold">Overdue measures</p>
          <ul className="list-disc pl-5">
            {overdue.map(({ r, m }) => (
              <li key={m.id}>
                R{r.number} {riskName(r)}: <span className="chip-bad">Overdue</span> since {m.due} ({STATUS_TEXT[m.status] ?? "no status"})
                {m.description ? ` – ${m.description.slice(0, 80)}` : ""}
              </li>
            ))}
          </ul>
          <p className="help-text">Overdue items stay visible and do not change any score or decision.</p>
        </div>
      ) : null}

      {risks.some((r) => r.flags.length) ? (
        <details className="text-sm">
          <summary className="w-fit cursor-pointer text-brand-700">Points to check ({risks.reduce((n, r) => n + r.flags.length, 0)})</summary>
          <ul className="mt-1 space-y-2">
            {risks
              .filter((r) => r.flags.length)
              .map((r) => (
                <li key={r.recordId}>
                  <strong>R{r.number} {riskName(r)}</strong>
                  <ul className="list-disc pl-5 text-ink-soft">
                    {r.flags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** Starting points from the template's example risks. They must be adapted and confirmed; scores are never copied. */
export function RiskExamplesPicker() {
  const { store, page } = useStoreCtx();
  useStoreRev(store);
  const perm = canChangeRecords(page.actor, page.ctx, "J2");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const details: Record<string, string> = {
    ex1: "Template example scores: inherent 3 × 2 = 6 MEDIUM; with a disclaimer and privacy policy link, residual 2 × 2 = 4 LOW.",
    ex2: "Template example scores: inherent 3 × 4 = 12 HIGH; with encryption and DLP tools, residual 2 × 4 = 8 MEDIUM, with additional measures described.",
    ex3: "Template example scores: inherent 4 × 4 = 16 HIGH; residual 3 × 4 = 12 HIGH, with additional measures described.",
  };
  return (
    <details className="rounded-md border border-slate-200 bg-white p-3 text-sm">
      <summary className="w-fit cursor-pointer font-medium text-brand-700">Start from an example risk</summary>
      <p className="help-text mt-1">
        An example is only a starting point. It is added to your register unconfirmed, without scores. You must adapt it to your processing, describe the harm to individuals and
        tick the confirmation before it counts as complete.
      </p>
      <ul className="mt-2 space-y-2">
        {RISK_EXAMPLES.map((ex) => (
          <li key={ex.key} className="rounded border border-slate-200 p-2">
            <p>
              <strong>{ex.name}.</strong> {ex.description}
            </p>
            <p className="text-ink-soft">{details[ex.key]}</p>
            {perm.ok ? (
              <button
                type="button"
                className="btn-secondary mt-1"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMsg(null);
                  const res = await store.addRecordId("J.risk", null);
                  setBusy(false);
                  if (!res.id) {
                    setMsg(res.error ?? "Could not add the risk.");
                    return;
                  }
                  store.edit("J.risk.name", res.id, { value: ex.name });
                  store.edit("J.risk.description", res.id, { value: ex.description });
                  store.edit("J.risk.fromExample", res.id, { value: ex.key });
                }}
              >
                Add to my register as a starting point
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {msg ? (
        <p role="alert" className="mt-1 font-medium text-red-800">
          {msg}
        </p>
      ) : null}
    </details>
  );
}

/** Shown in the supervisory authority section. A prompt only, never a legal conclusion. */
export function ConsultFlag() {
  const model = useModel();
  const high = consultationPrompt(buildRisks(model));
  if (high.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        No risk currently has a HIGH current residual risk. A high inherent score alone does not trigger this question.
      </p>
    );
  }
  return (
    <p role="status" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-950">
      <strong>For the DPO and owner to consider:</strong> current residual risk is HIGH for {high.map((r) => `R${r.number} ${riskName(r)}`).join("; ")}. If residual risks remain
      HIGH after mitigation and cannot be reduced further, the template says consultation with the supervisory authority is required. This prompt is not a legal conclusion.
    </p>
  );
}
