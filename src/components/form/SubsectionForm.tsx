"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  STAGES,
  SUBSECTIONS,
  fieldIndex,
  stageNumber,
  subsectionById,
  subsectionLabel,
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
import { SectionComments } from "./Comments";
import { GovStatus } from "./Governance";
import { postAction, useCollab } from "./collab";
import { ConsultFlag, RiskExamplesPicker, RiskSummary } from "./Risk";
import { Q5Table, ScreeningOutcomes, SuggestionBlock } from "./Screening";
import { useModel } from "./useModel";

export { useModel } from "./useModel";

// ------------------------------------------------------------------ main component

export function SubsectionForm({ subsectionId }: { subsectionId: string }) {
  const { store, page, navigate } = useStoreCtx();
  const model = useModel();
  const sub = subsectionById.get(subsectionId);

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
    <div className={`grid gap-5 ${sub.noAbout ? "" : "lg:grid-cols-[minmax(0,1fr)_auto]"}`}>
      <div>
        <p className="text-sm text-ink-soft">
          {stageNumber(stage.id)}. {stage.title}
        </p>
        <h2 className="mt-0.5 text-lg font-semibold">
          {subsectionLabel(sub.id)} {sub.title}
        </h2>
        <CarriedForward subsectionId={sub.id} />

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

        <form className="mt-4 space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
          <Items items={sub.items} recordId="" subsectionId={sub.id} evalCtx={model.ctx} />
        </form>

        <SectionComments subsectionId={sub.id} />
        <nav className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4" aria-label="Section navigation">
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
          <button type="button" className="btn-secondary" onClick={() => void store.flush()}>
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
        </nav>
      </div>

      {sub.noAbout ? null : (
      <aside aria-label="About this section" className="order-first lg:order-none">
        <details className="rounded-md border border-slate-200 bg-white p-3 text-sm lg:sticky lg:top-4 lg:max-w-xs">
          <summary className="w-fit cursor-pointer font-medium text-brand-700">About this section</summary>
          <HelpPanel summary={sub.summary} intro={sub.intro} help={sub.help} />
        </details>
      </aside>
      )}
    </div>
  );
}

function HelpPanel({ summary, intro, help }: { summary: string; intro?: string; help?: Help }) {
  return (
    <div className="mt-2 space-y-2 text-ink-soft">
      <p>{summary}</p>
      {intro ? <p>{intro}</p> : null}
      {help?.explain ? <p>{help.explain}</p> : null}
      {help?.include ? (
        <p>
          <strong className="text-ink">What your answer should include:</strong> {help.include}
        </p>
      ) : null}
      {help?.example ? (
        <p>
          <strong className="text-ink">Example (guidance, not your answer):</strong> {help.example}
        </p>
      ) : null}
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
          if (it.hidden) return null;
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

  if (col.workflow) return null; // recorded in Review and decisions

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

  if (col.compact) {
    return (
      <section aria-label={col.label} className={nested ? "mt-3 border-l-2 border-slate-200 pl-3" : ""}>
        {nested ? <h4 className="text-sm font-semibold">{col.label}</h4> : null}
        {col.guidance ? (
          <>
            <h3 className="text-base font-semibold">{col.itemLabel}</h3>
            <details className="mt-1 text-sm">
              <summary className="w-fit cursor-pointer text-brand-700">Guidance</summary>
              <p className="mt-1 max-w-prose2 text-ink-soft">{col.guidance}</p>
            </details>
          </>
        ) : null}
        {col.min && recs.length < col.min ? <p className="help-text">Add at least one to complete this part.</p> : null}
        <ol className="mt-2 space-y-3">
          {recs.map((r, i) => {
            const t = titleOf(r.id);
            const title = `${col.itemLabel} ${i + 1}${t ? ` — ${t}` : ""}`;
            const remove = perm.ok ? (
              confirmId === r.id ? (
                <span className="flex flex-wrap items-center gap-3 text-sm">
                  <button
                    type="button"
                    className="btn-link text-red-800"
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
                  <button type="button" className="btn-link" onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="btn-link text-red-800" onClick={() => setConfirmId(r.id)}>
                  Remove {col.itemLabel.toLowerCase()}
                </button>
              )
            ) : null;
            const body = (
              <>
                <div className="mt-2 space-y-3">
                  <Items items={col.items} recordId={r.id} subsectionId={subsectionId} evalCtx={evalCtx} />
                </div>
                {remove ? <div className="mt-2">{remove}</div> : null}
              </>
            );
            return col.collapsible ? (
              <li key={r.id}>
                <details open className="group rounded-md border border-slate-200 bg-white p-3">
                  <summary className="cursor-pointer font-medium">
                    <span aria-hidden="true" className="mr-1.5 group-open:hidden">+</span>
                    <span aria-hidden="true" className="mr-1.5 hidden group-open:inline">−</span>
                    {title}
                  </summary>
                  <div className="mt-2">{body}</div>
                </details>
              </li>
            ) : (
              <li key={r.id} className="rounded-md border border-slate-200 bg-white p-3">
                <h4 className="font-medium">{title}</h4>
                <div className="mt-1">{body}</div>
              </li>
            );
          })}
        </ol>
        {perm.ok ? (
          <button
            type="button"
            className="btn-link mt-2"
            disabled={busy}
            onClick={() => void run(() => store.addRecord(col.id, parentRecordId === "" ? null : parentRecordId))}
          >
            {col.addLabel ?? `+ Add ${col.itemLabel.toLowerCase()}`}
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
                {col.id === "J.risk.measure" && measureOverdue(store, r.id) ? (
                  <span className="chip-bad ml-2">Overdue since {String(store.get("J.risk.due", r.id)?.value)}</span>
                ) : null}
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
      return (
        <div>
          {info.title ? <h3 className="mt-2 text-base font-semibold">{info.title}</h3> : null}
          {info.body ? <p className={info.title ? "help-text mt-1 max-w-prose2" : ""}>{info.body}</p> : null}
        </div>
      );
    case "suggestion":
      return <SuggestionBlock qid={(info.ref ?? "q1") as "q1"} />;
    case "q5table":
      return <Q5Table />;
    case "riskSummary":
      return <RiskSummary />;
    case "consultFlag":
      return <ConsultFlag />;
    case "govStatus":
      return <GovStatus kind={(info.ref ?? "screening") as "screening"} />;
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
      return <RiskExamplesPicker />;
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
                  <td className="py-1">See Review and decisions and History and versions</td>
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

function measureOverdue(store: { get: (f: string, r: string) => { value: unknown } | undefined }, recordId: string): boolean {
  const due = store.get("J.risk.due", recordId)?.value;
  const status = store.get("J.risk.status", recordId)?.value;
  return typeof due === "string" && due !== "" && due < new Date().toISOString().slice(0, 10) && status !== "COMPLETED";
}

/** A section carried forward into a new revision stays "please review" until the owner or assignee confirms it. */
function CarriedForward({ subsectionId }: { subsectionId: string }) {
  const { page, store } = useStoreCtx();
  const { unreviewed, markReviewed, can } = useCollab();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!unreviewed.has(subsectionId)) return null;
  const allowed = can("confirmReviewed") && (page.actor.id === page.ctx.ownerId || page.ctx.assignedSubsections.includes(subsectionId));
  return (
    <div className="mt-3 max-w-prose2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm" role="status">
      <p className="font-semibold">Carried forward — please review</p>
      <p>These answers were copied from the previous version. Check them, change what is out of date, then confirm.</p>
      {allowed ? (
        <button
          type="button"
          className="btn-secondary mt-2"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            await store.flush();
            const r = await postAction(page.assessment.id, { action: "confirmReviewed", subsectionId });
            setBusy(false);
            if (!r.ok) return setMsg(r.data.error ?? "Could not confirm.");
            markReviewed(subsectionId);
          }}
        >
          I have reviewed this section
        </button>
      ) : null}
      {msg ? <p role="alert" className="mt-1 font-medium text-red-800">{msg}</p> : null}
    </div>
  );
}
