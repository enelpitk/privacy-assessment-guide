"use client";

import { fieldIndex } from "@/content";
import { canEditField } from "@/domain/permissions";
import {
  Q_LABEL,
  SCREENING_RULES,
  evaluateScreening,
  type QId,
  type Tri,
} from "@/domain/screening";
import { useStoreCtx, useStoreRev } from "./context";
import { useModel } from "./useModel";

const triText = (t: Tri) => (t === "YES" ? "Yes" : t === "NO" ? "No" : "Unresolved");

function RulesNote() {
  return (
    <p className="help-text">
      Worked out with the template’s screening rules ({SCREENING_RULES.version}). These are this organisation’s template rules, not statutory thresholds, and the result is an
      indication for the DPO to review.
    </p>
  );
}

/** Explainable suggestion for one screening question. Never applied without the user's confirmation. */
export function SuggestionBlock({ qid }: { qid: QId }) {
  const { store, page } = useStoreCtx();
  useStoreRev(store);
  const model = useModel();
  const ev = evaluateScreening(model.ctx);
  const q = ev.questions[qid];
  const loc = fieldIndex.get(q.fieldId)!;
  const perm = canEditField(page.actor, page.ctx, { id: q.fieldId, changeClass: "SUBSTANTIVE" }, loc.subsectionId);
  const definite = !q.noSuggestion && q.suggestion !== "UNRESOLVED";
  const confirmedHere = definite && q.confirmed === q.suggestion;

  return (
    <div className="max-w-prose2 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm" aria-label="Suggested answer">
      <p>
        <strong>Suggested answer:</strong>{" "}
        {q.noSuggestion ? "none for this question" : q.suggestion === "UNRESOLVED" ? "cannot be worked out yet" : triText(q.suggestion)}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
        {q.basis.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      {definite && perm.ok && !confirmedHere ? (
        <button type="button" className="btn-secondary mt-2" onClick={() => store.edit(q.fieldId, "", { value: q.suggestion })}>
          Use this suggestion: {triText(q.suggestion)}
        </button>
      ) : null}
      {confirmedHere ? <p className="mt-2 font-medium">You have confirmed this suggestion.</p> : null}
      {q.override ? (
        <p className="mt-2 font-medium text-amber-900">
          Your answer ({triText(q.confirmed)}) differs from the suggestion ({triText(q.suggestion)}).
          {q.overrideNeedsRationale ? " Please explain why in the rationale." : " Your rationale is kept with it."}
        </p>
      ) : null}
      {q.flags.map((f) => (
        <p key={f} className="mt-2 rounded border border-amber-400 bg-amber-50 p-2 text-amber-950">
          <strong>For DPO review:</strong> {f.replace(/^Q6_NOT_ALREADY_COVERED:\s*/, "")}
        </p>
      ))}
      <RulesNote />
    </div>
  );
}

/** Question 5: each sub-question needs the specific risk AND 10 000 or more individuals to whom it applies. */
export function Q5Table() {
  const model = useModel();
  const ev = evaluateScreening(model.ctx);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption className="mb-1 text-left font-semibold">Question 5 – result for each sub-question</caption>
          <thead>
            <tr className="border-b border-slate-300">
              <th className="py-1 pr-3" scope="col">Sub-question</th>
              <th className="py-1 pr-3" scope="col">Risk applies</th>
              <th className="py-1 pr-3" scope="col">Individuals</th>
              <th className="py-1 pr-3" scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {ev.q5.map((s) => (
              <tr key={s.key} className="border-b border-slate-200 align-top">
                <th scope="row" className="py-1 pr-3 font-medium">{s.label}</th>
                <td className="py-1 pr-3">{triText(s.risk)}</td>
                <td className="py-1 pr-3">
                  {s.count ? (s.count.min === s.count.max ? s.count.min.toLocaleString("en-GB") : `${s.count.min.toLocaleString("en-GB")} to ${s.count.max.toLocaleString("en-GB")}`) : "Not given"}
                </td>
                <td className="py-1 pr-3">
                  <strong>{triText(s.result)}</strong>
                  {s.inconsistent ? <span className="chip-warn ml-2">Check the numbers</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="help-text">
        Question 5 is Yes if at least one sub-question is Yes. Numbers are never added together across sub-questions. A sub-question that is unresolved does not cancel one that
        is Yes; it is listed separately.
      </p>
      {ev.warnings
        .filter((w) => w.includes("larger than the total"))
        .map((w) => (
          <p key={w} role="status" className="rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-950">
            {w}
          </p>
        ))}
    </div>
  );
}

/** Independent DPIA and TIA indications, with unresolved answers shown separately. */
export function ScreeningOutcomes() {
  const { store, page } = useStoreCtx();
  useStoreRev(store);
  const model = useModel();
  const ev = evaluateScreening(model.ctx);
  const o = ev.outcomes;
  const awaiting = page.assessment.screeningStatus !== "DECIDED";
  return (
    <div className="space-y-3">
      <section className="card" aria-label="Full DPIA indication">
        <h3 className="font-semibold">Full DPIA</h3>
        {o.fullDpiaIndicated ? (
          <>
            <p className="mt-1">
              <span className="chip-warn">Full DPIA indicated{awaiting ? " — awaiting DPO review" : ""}</span>
            </p>
            <p className="help-text mt-1">Because you confirmed “Yes” to: {o.fullBecause.map((q) => Q_LABEL[q]).join("; ")}.</p>
          </>
        ) : o.headline === "NO_INDICATION" ? (
          <p className="mt-1">
            <span className="chip-neutral">No screening indication from the template rules</span> — every question is answered and none is Yes. The DPO may still require a full DPIA.
          </p>
        ) : (
          <p className="mt-1">
            <span className="chip-neutral">No confirmed indication yet</span> — no question is confirmed Yes, but some are still unresolved (below). This is not a conclusion that no full DPIA is needed.
          </p>
        )}
      </section>

      <section className="card" aria-label="Transfer impact assessment indication">
        <h3 className="font-semibold">Transfer Impact Assessment (TIA) follow-up</h3>
        <p className="mt-1">
          {o.tiaIndicated ? (
            <span className="chip-warn">TIA follow-up indicated</span>
          ) : (
            <span className="chip-neutral">Not indicated by the confirmed answers</span>
          )}
        </p>
        <p className="help-text mt-1">
          This comes only from question 7. It is separate from, and additional to, any DPIA indication, and a Yes to question 7 alone never indicates a full DPIA.
        </p>
      </section>

      <section className="card" aria-label="Unresolved screening questions">
        <h3 className="font-semibold">Unresolved screening questions</h3>
        {o.unresolved.length === 0 ? (
          <p className="mt-1 text-sm">None.</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {o.unresolved.map((u) => (
              <li key={u.q}>
                {Q_LABEL[u.q]}: {u.reason}.
              </li>
            ))}
          </ul>
        )}
        <p className="help-text mt-1">Unresolved questions never count as “No”, and they never cancel a positive indication above.</p>
      </section>

      {ev.warnings.length ? (
        <section className="card" aria-label="Points to check">
          <h3 className="font-semibold">Points to check</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {ev.warnings.map((w) => (
              <li key={w}>{w.replace(/Q6_NOT_ALREADY_COVERED:\s*/, "")}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-brand-700">How each question was decided</summary>
        <table className="mt-2 w-full min-w-[30rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="py-1 pr-3" scope="col">Question</th>
              <th className="py-1 pr-3" scope="col">Suggested</th>
              <th className="py-1" scope="col">You confirmed</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(ev.questions).map((q) => (
              <tr key={q.id} className="border-b border-slate-200 align-top">
                <th scope="row" className="py-1 pr-3 font-medium">{Q_LABEL[q.id]}</th>
                <td className="py-1 pr-3">{q.noSuggestion ? "None" : triText(q.suggestion)}</td>
                <td className="py-1">{triText(q.confirmed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <RulesNote />
      <p className="help-text">
        DPO review is mandatory for every assessment, including one that stops after the pre-assessment. Recording the DPO’s screening decision arrives in a later stage. The
        DPO can require a full DPIA whatever the screening shows.
      </p>
    </div>
  );
}
