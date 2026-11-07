"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  STAGES,
  SUBSECTIONS,
  fieldIndex,
  subsectionById,
  type CollectionDef,
  type Help,
  type InfoDef,
  type Item,
} from "@/content";
import type { EvalCtx } from "@/domain/conditions";
import { canChangeRecords } from "@/domain/permissions";
import {
  buildModel,
  isItemActive,
  isSubsectionActive,
  recordsFor,
  type RecordRow,
} from "@/domain/model";
import { IMPACT_SCALE, PROBABILITY_SCALE, riskCategory, riskScore } from "@/domain/risk";
import { isEmptyValue } from "@/domain/validation";
import { fieldKey } from "@/lib/types";
import { useStoreCtx, useStoreRev } from "./context";
import { FieldBlock, useFormat } from "./Fields";

export function useModel() {
  const { store } = useStoreCtx();
  useStoreRev(store);
  const rows: RecordRow[] = store.records.map((r) => ({
    id: r.id,
    collection: r.collection,
    parentId: r.parentId,
    ordering: r.ordering,
  }));
  return buildModel(store.responses(), rows);
}

// ------------------------------------------------------------------ main component

export function SubsectionForm({ subsectionId }: { subsectionId: string }) {
  const { store, page, navigate } = useStoreCtx();
  const model = useModel();
  const sub = subsectionById.get(subsectionId);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const order = SUBSECTIONS.filter((s) => isSubsectionActive(s, model.ctx));
  const idx = order.findIndex((s) => s.id === subsectionId);
  const prev = idx > 0 ? order[idx - 1] : idx === -1 ? SUBSECTIONS[SUBSECTIONS.findIndex((s) => s.id === subsectionId) - 1] : undefined;
  const next = idx >= 0 ? order[idx + 1] : SUBSECTIONS[SUBSECTIONS.findIndex((s) => s.id === subsectionId) + 1];

  const hiddenCount = useMemo(
    () => (sub ? countHiddenAnswers(sub.items, model.ctx, model.records, "", store.fields) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sub, model],
  );
  if (!sub) return <p>Unknown section.</p>;
  const stage = STAGES.find((s) => s.id === sub.stage)!;
  const active = isSubsectionActive(sub, model.ctx);
  const canStructure = canChangeRecords(page.actor, page.ctx, sub.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div>
        <p className="text-sm text-ink-soft">
          Stage {stage.id}: {stage.title}
        </p>
        <h2 className="mt-1 text-2xl font-semibold">
          {sub.id} · {sub.title}
        </h2>
        <p className="help-text mt-1">{sub.summary}</p>
        {sub.intro ? <p className="mt-3 max-w-prose2 text-base">{sub.intro}</p> : null}

        {!active ? (
          <div className="mt-4 rounded-md border border-slate-300 bg-white p-3">
            <p className="font-medium">This section does not currently apply.</p>
            <p className="help-text">
              It is excluded from completeness. Any answers you already entered here are kept and come back if it applies again.
            </p>
          </div>
        ) : null}
        {!canStructure.ok ? (
          <p className="mt-3 max-w-prose2 rounded-md border border-slate-300 bg-slate-100 p-2 text-sm" role="status">
            You can read this section but not edit it. {canStructure.reason}
          </p>
        ) : null}
        {hiddenCount > 0 ? (
          <p className="mt-3 max-w-prose2 rounded-md border border-slate-300 bg-white p-2 text-sm" role="status">
            {hiddenCount} answer{hiddenCount === 1 ? " is" : "s are"} hidden because the related option does not apply right now. They are kept, and
            will come back if it applies again.
          </p>
        ) : null}

        <form className="mt-5 space-y-6" onSubmit={(e) => e.preventDefault()} noValidate>
          <Items items={sub.items} recordId="" subsectionId={sub.id} evalCtx={model.ctx} />
        </form>

        <nav className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4" aria-label="Section navigation">
          {prev ? (
            <a
              className="btn-secondary"
              href={`/assessments/${page.assessment.id}/s/${prev.id}`}
              onClick={(e) => {
                e.preventDefault();
                void navigate(`/assessments/${page.assessment.id}/s/${prev.id}`);
              }}
            >
              Previous: {prev.title}
            </a>
          ) : null}
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              const ok = await store.flush();
              setSaveMsg(ok ? "Saved." : "Some changes could not be saved. See the notes next to the affected answers.");
            }}
          >
            Save draft
          </button>
          {next ? (
            <a
              className="btn-primary"
              href={`/assessments/${page.assessment.id}/s/${next.id}`}
              onClick={(e) => {
                e.preventDefault();
                void navigate(`/assessments/${page.assessment.id}/s/${next.id}`);
              }}
            >
              Next: {next.title}
            </a>
          ) : null}
          <span role="status" className="text-sm text-ink-soft">
            {saveMsg}
          </span>
        </nav>
      </div>

      <aside aria-label="Help for this section">
        <div className="hidden lg:sticky lg:top-4 lg:block">
          <HelpPanel title={sub.title} summary={sub.summary} help={sub.help} />
        </div>
        <details className="rounded-md border border-slate-200 bg-white p-3 lg:hidden">
          <summary className="cursor-pointer font-medium text-brand-700">Help for this section</summary>
          <div className="mt-2">
            <HelpPanel title={sub.title} summary={sub.summary} help={sub.help} />
          </div>
        </details>
      </aside>
    </div>
  );
}

function HelpPanel({ title, summary, help }: { title: string; summary: string; help?: Help }) {
  return (
    <div className="card text-sm">
      <h3 className="font-semibold">About “{title}”</h3>
      <p className="help-text mt-1">{summary}</p>
      {help?.explain ? <p className="mt-2">{help.explain}</p> : null}
      {help?.include ? (
        <p className="mt-2">
          <strong>What your answer should include:</strong> {help.include}
        </p>
      ) : null}
      {help?.example ? (
        <p className="mt-2 text-ink-soft">
          <strong>Example (guidance, not your answer):</strong> {help.example}
        </p>
      ) : null}
      {!help ? <p className="help-text mt-2">Use “Explain this” beside a question for guidance.</p> : null}
    </div>
  );
}

function countHiddenAnswers(
  items: Item[],
  ctx: EvalCtx,
  records: RecordRow[],
  recordId: string,
  fields: Map<string, { value: unknown; state: string; fieldId: string; recordId: string }>,
): number {
  let n = 0;
  for (const it of items) {
    if (it.kind === "info") continue;
    const active = isItemActive(it, ctx, recordId);
    if (it.kind === "field") {
      if (active) continue;
      const f = fields.get(fieldKey(it.id, recordId));
      if (f && !isEmptyValue(it, f.value)) n++;
    } else {
      const recs = recordsFor(records, it.id, recordId === "" ? null : recordId);
      for (const r of recs) {
        n += active
          ? countHiddenAnswers(it.items, ctx, records, r.id, fields)
          : countAll(it.items, records, r.id, fields);
      }
    }
  }
  return n;
}

function countAll(
  items: Item[],
  records: RecordRow[],
  recordId: string,
  fields: Map<string, { value: unknown; state: string; fieldId: string; recordId: string }>,
): number {
  let n = 0;
  for (const it of items) {
    if (it.kind === "field") {
      const f = fields.get(fieldKey(it.id, recordId));
      if (f && !isEmptyValue(it, f.value)) n++;
    } else if (it.kind === "collection") {
      for (const r of recordsFor(records, it.id, recordId === "" ? null : recordId)) {
        n += countAll(it.items, records, r.id, fields);
      }
    }
  }
  return n;
}

// ------------------------------------------------------------------ items

function Items({
  items,
  recordId,
  subsectionId,
  evalCtx,
}: {
  items: Item[];
  recordId: string;
  subsectionId: string;
  evalCtx: EvalCtx;
}) {
  return (
    <>
      {items.map((it) => {
        if (!isItemActive(it, evalCtx, recordId)) return null;
        if (it.kind === "field") {
          return (
            <div key={`${it.id}|${recordId}`} className="max-w-prose2">
              <FieldBlock def={it} recordId={recordId} subsectionId={subsectionId} evalCtx={evalCtx} />
            </div>
          );
        }
        if (it.kind === "collection") {
          return (
            <CollectionEditor
              key={`${it.id}|${recordId}`}
              col={it}
              parentRecordId={recordId}
              subsectionId={subsectionId}
              evalCtx={evalCtx}
            />
          );
        }
        return <InfoView key={it.id} info={it} />;
      })}
    </>
  );
}

function CollectionEditor({
  col,
  parentRecordId,
  subsectionId,
  evalCtx,
}: {
  col: CollectionDef;
  parentRecordId: string;
  subsectionId: string;
  evalCtx: EvalCtx;
}) {
  const { store, page } = useStoreCtx();
  useStoreRev(store);
  const fmt = useFormat();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rows: RecordRow[] = store.records.map((r) => ({ id: r.id, collection: r.collection, parentId: r.parentId, ordering: r.ordering }));
  const recs = recordsFor(rows, col.id, parentRecordId === "" ? null : parentRecordId);
  const perm = canChangeRecords(page.actor, page.ctx, subsectionId);
  const nested = parentRecordId !== "";

  if (col.workflow) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
        <p className="label">{col.label}</p>
        <p className="help-text mt-1">
          <strong>Pending:</strong> {col.workflowNote}
        </p>
      </div>
    );
  }

  const titleOf = (recordId: string) => {
    if (!col.titleField) return "";
    const def = fieldIndex.get(col.titleField)?.def;
    const f = store.get(col.titleField, recordId);
    if (!def || !f || isEmptyValue(def, f.value)) return "";
    const t = fmt(def, f.value);
    return t.length > 80 ? `${t.slice(0, 77)}…` : t;
  };

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setMsg(null);
    const err = await fn();
    setBusy(false);
    if (err === "RELOAD") {
      await store.flush();
      window.location.reload();
    } else setMsg(err);
  };

  return (
    <section aria-label={col.label} className={nested ? "mt-4 rounded-md border border-slate-200 bg-slate-50 p-3" : ""}>
      <h3 className={nested ? "text-base font-semibold" : "text-lg font-semibold"}>{col.label}</h3>
      {col.min && recs.length < col.min ? (
        <p className="help-text mt-1">Add at least {col.min === 1 ? "one" : col.min} to complete this part.</p>
      ) : null}
      <ol className="mt-3 space-y-4">
        {recs.map((r, i) => (
          <li key={r.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">
                {col.itemLabel} {i + 1}
                {titleOf(r.id) ? <span className="font-normal text-ink-soft"> — {titleOf(r.id)}</span> : null}
              </h4>
              {perm.ok ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-secondary !px-2.5 !py-1" disabled={busy || i === 0} onClick={() => void run(() => store.moveRecord(r.id, "up"))}>
                    Move up
                  </button>
                  <button
                    type="button"
                    className="btn-secondary !px-2.5 !py-1"
                    disabled={busy || i === recs.length - 1}
                    onClick={() => void run(() => store.moveRecord(r.id, "down"))}
                  >
                    Move down
                  </button>
                  {confirmId === r.id ? (
                    <>
                      <button
                        type="button"
                        className="btn-danger !px-2.5 !py-1"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const e = await store.removeRecord(r.id);
                            setConfirmId(null);
                            return e;
                          })
                        }
                      >
                        Confirm remove
                      </button>
                      <button type="button" className="btn-secondary !px-2.5 !py-1" onClick={() => setConfirmId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-secondary !px-2.5 !py-1" onClick={() => setConfirmId(r.id)}>
                      Remove {col.itemLabel.toLowerCase()}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <div className="mt-3 space-y-5">
              <Items items={col.items} recordId={r.id} subsectionId={subsectionId} evalCtx={evalCtx} />
            </div>
          </li>
        ))}
      </ol>
      {perm.ok ? (
        <button
          type="button"
          className="btn-primary mt-3"
          disabled={busy}
          onClick={() => void run(() => store.addRecord(col.id, parentRecordId === "" ? null : parentRecordId))}
        >
          {col.addLabel ?? `Add ${col.itemLabel.toLowerCase()}`}
        </button>
      ) : null}
      {msg ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-800">
          {msg}
        </p>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ info blocks

function InfoView({ info }: { info: InfoDef }): ReactNode {
  const { store, page } = useStoreCtx();
  useStoreRev(store);
  switch (info.block) {
    case "text":
      return info.title ? (
        <h3 className="mt-2 text-base font-semibold">{info.title}</h3>
      ) : (
        <p>{info.body}</p>
      );
    case "pending":
      return (
        <div className="rounded-md border border-dashed border-slate-400 bg-slate-50 p-3">
          <p className="font-semibold">
            {info.title} <span className="chip-neutral ml-1">Coming in Stage {info.pendingStage}</span>
          </p>
          <p className="help-text mt-1">{info.body}</p>
        </div>
      );
    case "scales":
      return (
        <div className="space-y-4">
          <ScaleTable title="Probability scale — how likely is it that the risk materialises?" rows={PROBABILITY_SCALE} />
          <ScaleTable title="Impact scale — how severe would the consequences be for data subjects?" rows={IMPACT_SCALE} />
        </div>
      );
    case "matrix":
      return <Matrix />;
    case "riskLegend":
      return <RiskLegend />;
    case "riskExamples":
      return <RiskExamples />;
    case "versionHistory":
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <caption className="mb-1 text-left font-semibold">Version history of this assessment</caption>
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-1 pr-3">Version</th>
                <th className="py-1 pr-3">Completion date</th>
                <th className="py-1 pr-3">Changes made</th>
                <th className="py-1 pr-3">Author</th>
                <th className="py-1">Reviewed by (DPO)</th>
              </tr>
            </thead>
            <tbody>
              {page.versions.map((v) => (
                <tr key={v.versionNumber} className="border-b border-slate-200 align-top">
                  <td className="py-1 pr-3">{v.versionNumber}</td>
                  <td className="py-1 pr-3">Not completed yet</td>
                  <td className="py-1 pr-3">{v.note}</td>
                  <td className="py-1 pr-3">{v.authorName}</td>
                  <td className="py-1">Pending — recorded in the DPO review (Stage 4)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "provenance":
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-left text-sm">
            <caption className="mb-1 text-left font-semibold">Template information (separate from this assessment’s history)</caption>
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-1 pr-3">Template version</th>
                <th className="py-1 pr-3">Valid from</th>
                <th className="py-1">Document owner</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["1", "01.12.2022", "Head of Compliance (original organisation)"],
                ["2", "06.05.2026", "Data protection compliance specialist"],
                ["3", "21.10.2026", "Data protection compliance specialist"],
              ].map((r) => (
                <tr key={r[0]} className="border-b border-slate-200">
                  <td className="py-1 pr-3">{r[0]}</td>
                  <td className="py-1 pr-3">{r[1]}</td>
                  <td className="py-1">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="help-text mt-2">Application template definition: tpl-1.0.0.</p>
        </div>
      );
    case "screeningOutcomes":
      return <ScreeningOutcomes />;
    default:
      return null;
  }
}

function ScaleTable({ title, rows }: { title: string; rows: readonly { value: string; label: string; description: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <caption className="mb-1 text-left font-semibold">{title}</caption>
        <thead>
          <tr className="border-b border-slate-300">
            <th className="py-1 pr-3">Level</th>
            <th className="py-1">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.value} className="border-b border-slate-200 align-top">
              <th scope="row" className="whitespace-nowrap py-1 pr-3 font-medium">
                {r.label}
              </th>
              <td className="py-1">{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Matrix() {
  const cat = (s: number) => riskCategory(s)!;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[28rem] border-collapse text-center text-sm">
        <caption className="mb-1 text-left font-semibold">Risk matrix (Impact vs. Probability)</caption>
        <thead>
          <tr>
            <th className="p-1 text-left">Impact ↓ / Probability →</th>
            {[1, 2, 3, 4].map((p) => (
              <th key={p} scope="col" className="border border-slate-300 p-1">
                Probability {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[4, 3, 2, 1].map((i) => (
            <tr key={i}>
              <th scope="row" className="border border-slate-300 p-1 text-left">
                Impact {i}
              </th>
              {[1, 2, 3, 4].map((p) => {
                const s = p * i;
                const c = cat(s);
                return (
                  <td
                    key={p}
                    className={`border border-slate-300 p-2 ${c === "HIGH" ? "bg-red-50 font-semibold" : c === "MEDIUM" ? "bg-amber-50" : "bg-emerald-50"}`}
                  >
                    <span className="block text-base">{s}</span>
                    <span className="block text-xs uppercase tracking-wide">{c}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help-text mt-1">Categories are written out as well as coloured. Plotting your own risks on the matrix arrives in Stage 3.</p>
    </div>
  );
}

function RiskLegend() {
  const rows = [
    {
      c: "LOW (1–4)",
      cls: "chip-good",
      t: "Acceptable. Monitor and review periodically. No immediate action is required. Document the assessment and schedule periodic review to ensure risk level does not increase.",
    },
    {
      c: "MEDIUM (5–8)",
      cls: "chip-warn",
      t: "Mitigate and document decisions. Identify and implement reasonable mitigation measures. Record the rationale for all decisions taken regarding the risk.",
    },
    {
      c: "HIGH (9–16)",
      cls: "chip-bad",
      t: "Implementation of mitigation measures is mandatory. Prior consultation with the supervisory authority is required. Where risks cannot be sufficiently mitigated, processing may need to be suspended or abandoned.",
    },
  ];
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">What each category means (template text)</h3>
      {rows.map((r) => (
        <p key={r.c}>
          <span className={r.cls}>{r.c}</span> <span className="ml-1">{r.t}</span>
        </p>
      ))}
      <p className="help-text">
        This is the template’s own wording. The template also says consultation is required when residual risks remain HIGH after mitigation and cannot be
        reduced further. A score alone does not decide whether consultation is legally required. See the conclusion stage.
      </p>
    </div>
  );
}

function RiskExamples() {
  const ex = [
    {
      n: "Processing without legal basis",
      d: "Data subjects have no knowledge their data is being used, no ability to consent, object, or exercise rights.",
      s: "Inherent 3 × 2 = 6 MEDIUM. Measures: disclaimer on personal data processing, link to privacy policy. Residual 2 × 2 = 4 LOW.",
    },
    {
      n: "Unauthorised access by third party",
      d: "Personal data leaked or stolen due to cyberattack. The data subject could become a target for fraudulent activities.",
      s: "Inherent 3 × 4 = 12 HIGH. Measures: encryption at rest and in transit, DLP tools. Residual 2 × 4 = 8 MEDIUM, with additional measures described.",
    },
    {
      n: "Third-party processor risk",
      d: "Processor fails to provide adequate security or compliance guarantees.",
      s: "Inherent 4 × 4 = 16 HIGH. Residual 3 × 4 = 12 HIGH, with additional measures described.",
    },
  ];
  return (
    <details className="rounded-md border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer font-medium text-brand-700">Example risks from the template (guidance, not your risks)</summary>
      <p className="help-text mt-1">
        Adapt these to your own processing and describe the harm to individuals. They are never added to your register automatically.
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {ex.map((e) => (
          <li key={e.n} className="rounded border border-slate-200 p-2">
            <strong>{e.n}.</strong> {e.d}
            <br />
            <span className="text-ink-soft">{e.s}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ScreeningOutcomes() {
  const { store } = useStoreCtx();
  useStoreRev(store);
  const fmt = useFormat();
  const qs = ["C.q1", "C.q2", "C.q3", "C.q4", "C.q5", "C.q6", "C.q7"];
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-dashed border-slate-400 bg-slate-50 p-3">
        <p className="font-semibold">
          Automatic outcomes <span className="chip-neutral ml-1">Coming in Stage 3</span>
        </p>
        <p className="help-text mt-1">
          The application does not yet work out “Full DPIA indicated”, “TIA follow-up indicated” or unresolved questions. Below are your confirmed answers and the template’s
          outcome rules.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-left text-sm">
          <caption className="mb-1 text-left font-semibold">Your confirmed screening answers</caption>
          <tbody>
            {qs.map((id) => {
              const def = fieldIndex.get(id)!.def;
              const f = store.get(id, "");
              const label =
                f?.state === "NOT_SURE"
                  ? "Not sure — unresolved"
                  : f?.state === "COMPLETE_LATER"
                    ? "Complete later — unresolved"
                    : f && !isEmptyValue(def, f.value)
                      ? fmt(def, f.value)
                      : "Not answered";
              return (
                <tr key={id} className="border-b border-slate-200">
                  <th scope="row" className="py-1 pr-3 font-medium">
                    Question {id.slice(-1)}
                  </th>
                  <td className="py-1">{label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>If there are no ‘Yes’ answers, the pre-assessment is complete and no full DPIA is indicated by the screening results. The DPO can still require one.</li>
        <li>
          Questions 1–6: one or more ‘Yes’ — the processing is likely to result in a high risk to the rights and freedoms of individuals. A full DPIA is indicated, unless the
          DPO records a justified exception.
        </li>
        <li>Question 7: ‘Yes’ — Transfer Impact Assessment (TIA) follow-up. This is separate from, and additional to, any DPIA indication.</li>
      </ul>
    </div>
  );
}
