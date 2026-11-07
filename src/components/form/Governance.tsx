"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SUBSECTIONS, STAGES, stageNumber, subsectionById, subsectionLabel } from "@/content";
import { rolesOf, CHANGE_CATEGORIES } from "@/domain/workflow";
import type { GovernanceData } from "@/lib/govTypes";
import { lifecycleLabel, SCREENING_LABEL } from "@/lib/labels";
import { NON_ASSIGNABLE } from "@/server/assignable";
import { useStoreCtx } from "./context";
import { formatTime } from "./Fields";
import { useCollab, useRunner } from "./collab";

// ------------------------------------------------------------------ small helpers

const PATH_LABEL = { OPEN: "Not decided yet", FULL: "Full assessment", PRE_ONLY: "Pre-assessment only" } as const;
const OPINION_LABEL = { NO_OBJECTIONS: "No objections", RECOMMENDATIONS: "Recommendations / conditions", OBJECTIONS_REMAIN: "Objections remain" } as const;
const DECISION_LABEL = { APPROVED: "Approved", CONDITIONALLY_APPROVED: "Conditionally approved", REJECTED: "Rejected" } as const;
const SCREENING_DECISION_LABEL = { PROCEED_FULL: "Proceed to full assessment", PRE_ASSESSMENT_SUFFICIENT: "Pre-assessment sufficient — no full DPIA required" } as const;

function Card({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="card max-w-prose2" aria-label={title} id={id}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-sm">{children}</div>
    </section>
  );
}

function Err({ msg, items }: { msg: string | null; items?: string[] }) {
  if (!msg) return null;
  return (
    <div role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-red-950">
      <p className="font-medium">{msg}</p>
      {items?.length ? (
        <ul className="mt-1 list-disc pl-5">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  const id = `ta-${label.replace(/\W+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <textarea id={id} className="input mt-1" rows={rows} value={value} maxLength={8000} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** A button that runs an action and shows the outcome. Flushes pending answer saves first. */
function Do({
  body,
  children,
  primary,
  disabled,
  confirm,
  onDone,
  danger,
}: {
  body: Record<string, unknown>;
  children: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  confirm?: string;
  danger?: boolean;
  onDone?: (data: Record<string, unknown>) => void;
}) {
  const { page, store } = useStoreCtx();
  const run = useRunner(page.assessment.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; items?: string[] } | null>(null);
  return (
    <div className="inline-block">
      <button
        type="button"
        className={danger ? "btn-danger" : primary ? "btn-primary" : "btn-secondary"}
        disabled={busy || disabled}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setErr(null);
          const ok = await store.flush();
          if (!ok) {
            setBusy(false);
            return setErr({ msg: "Some answers could not be saved yet. Resolve that first, then try again." });
          }
          const r = await run(body, { refresh: !onDone });
          setBusy(false);
          if (r.error) {
            const det = Array.isArray(r.data.details) ? (r.data.details as { label?: string; reason?: string }[]).map((d) => (typeof d === "string" ? d : `${d.label ?? ""}: ${d.reason ?? ""}`)) : undefined;
            return setErr({ msg: r.error, items: det });
          }
          onDone?.(r.data);
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {err ? (
        <div className="mt-2 max-w-prose2">
          <Err msg={err.msg} items={err.items} />
        </div>
      ) : null}
    </div>
  );
}

/** A form that posts one action. */
function Form({ action, fields, submit, valid, children, reset, confirm }: { action: string; fields: Record<string, unknown>; submit: string; valid: boolean; children: ReactNode; reset?: () => void; confirm?: string }) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      {children}
      <Do body={{ action, ...fields }} primary disabled={!valid} confirm={confirm} onDone={reset ? () => reset() : undefined}>
        {submit}
      </Do>
    </div>
  );
}

function Blockers({ items }: { items: GovernanceData["fullBlockers"] }) {
  const [more, setMore] = useState(false);
  if (items.length === 0) return <p className="text-emerald-900">Nothing blocks submission: every applicable item is answered, or is unresolved with an explanation for the reviewer.</p>;
  const shown = more ? items : items.slice(0, 6);
  return (
    <div className="rounded border border-amber-400 bg-amber-50 p-2 text-amber-950">
      <p className="font-medium">{items.length} item{items.length === 1 ? "" : "s"} must be dealt with before this can be submitted:</p>
      <ul className="mt-1 list-disc pl-5">
        {shown.map((b, i) => (
          <li key={`${b.fieldId}${i}`}>
            <strong>{subsectionLabel(b.subsectionId)}</strong> {b.label.length > 90 ? `${b.label.slice(0, 87)}…` : b.label} — {b.reason}
          </li>
        ))}
      </ul>
      {items.length > 6 ? (
        <button type="button" className="btn-link mt-1" onClick={() => setMore((m) => !m)}>
          {more ? "Show fewer" : `Show all ${items.length}`}
        </button>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ status

function StatusCard({ gov }: { gov: GovernanceData }) {
  const { page } = useStoreCtx();
  const s = gov.state;
  return (
    <Card title="Where this assessment stands">
      <p className="flex flex-wrap gap-2">
        <span className="chip-neutral">{lifecycleLabel(s.lifecycle, gov.versions.find((v) => v.current)?.rejected === true)}</span>
        <span className="chip-neutral">{SCREENING_LABEL[s.screeningStatus] ?? s.screeningStatus}</span>
        <span className="chip-neutral">Path: {PATH_LABEL[s.path]}</span>
        <span className="chip-neutral">Version {page.assessment.versionNumber}</span>
      </p>
      <p>
        Owner: <strong>{gov.ownerName}</strong> · Assigned DPO: <strong>{gov.dpoName}</strong>
      </p>
      <p className="help-text">
        These are recorded workflow steps by people. They are not a software certification that the processing is lawful. DPO review is mandatory for every assessment, including one that
        stops after the pre-assessment.
      </p>
      {s.path === "PRE_ONLY" ? (
        <p>The DPO decided the pre-assessment is sufficient, so the full-assessment sections are not applicable. Any answers already entered there are kept.</p>
      ) : null}
      {s.lifecycle === "IN_DPO_REVIEW" ? <p>Substantive editing is locked while the DPO reviews. Comments stay open.</p> : null}
    </Card>
  );
}

// ------------------------------------------------------------------ screening gate

function ScreeningCard({ gov }: { gov: GovernanceData }) {
  const { page } = useStoreCtx();
  const roles = rolesOf(page.actor, page.ctx);
  const s = gov.state;
  const draftish = s.lifecycle === "DRAFT" || s.lifecycle === "CHANGES_REQUESTED";
  const [decision, setDecision] = useState<"PROCEED_FULL" | "PRE_ASSESSMENT_SUFFICIENT">("PROCEED_FULL");
  const [rationale, setRationale] = useState("");
  const [advice, setAdvice] = useState("");
  const [exc, setExc] = useState("");
  const [mit, setMit] = useState("");
  const [cat, setCat] = useState("NO_OBJECTIONS");
  const [op, setOp] = useState("");
  const indicated = gov.screening?.fullDpiaIndicated ?? false;
  const preOnly = decision === "PRE_ASSESSMENT_SUFFICIENT";
  const valid = rationale.trim() !== "" && (!preOnly || (op.trim() !== "" && (!indicated || (exc.trim() !== "" && mit.trim() !== ""))));

  return (
    <Card title="Gate 1: screening review (pre-assessment)">
      {gov.screening ? (
        <p>
          Screening indications at submission:{" "}
          <strong>{gov.screening.fullDpiaIndicated ? "Full DPIA indicated" : "no full DPIA indication"}</strong>;{" "}
          <strong>{gov.screening.tiaIndicated ? "TIA follow-up indicated" : "no TIA follow-up indicated"}</strong>
          {gov.screening.unresolved.length ? `; ${gov.screening.unresolved.length} screening question(s) unresolved` : ""}. These are indications under the template rules, not conclusions.
        </p>
      ) : (
        <p>The pre-assessment (sections 1 to 3) has not been submitted yet.</p>
      )}

      {roles.owner && (s.screeningStatus === "NOT_SUBMITTED" || s.screeningStatus === "INVALIDATED") && draftish ? (
        <>
          <Blockers items={gov.screeningBlockers} />
          <p className="help-text">Submitting saves a read-only snapshot of sections 1 to 3 and locks them. The full-assessment sections stay editable while the DPO reviews.</p>
          <Do body={{ action: "submitScreening" }} primary disabled={gov.screeningBlockers.length > 0}>
            Submit pre-assessment for DPO review
          </Do>
        </>
      ) : null}
      {roles.owner && s.screeningStatus === "AWAITING_DPO" ? (
        <>
          <p>
            <span className="chip-warn">Full DPIA indicated — awaiting DPO review</span>
            {gov.screening?.fullDpiaIndicated ? null : <span className="help-text ml-2">(Awaiting the DPO’s screening decision.)</span>}
          </p>
          <Do body={{ action: "withdrawScreening" }}>Withdraw for editing</Do>
        </>
      ) : null}
      {roles.owner && s.screeningStatus === "DECIDED" && ["DRAFT", "CHANGES_REQUESTED", "AWAITING_OWNER_DECISION"].includes(s.lifecycle) ? (
        <div>
          <p className="help-text">Changing screening answers after the DPO’s decision invalidates that decision and needs a renewed DPO review. The earlier snapshot and decision stay in the history.</p>
          <Do body={{ action: "reopenScreening" }} confirm="Reopen the screening? The DPO’s decision will be marked as superseded and the screening will need to be submitted again.">
            Reopen screening for changes
          </Do>
        </div>
      ) : null}

      {roles.assignedDpo && s.screeningStatus === "AWAITING_DPO" ? (
        <Form
          action="recordScreeningDecision"
          submit="Record screening decision"
          valid={valid}
          fields={{ decision, rationale, advice: advice || undefined, exceptionJustification: exc || undefined, mitigationControls: mit || undefined, opinionCategory: preOnly ? cat : undefined, opinionText: preOnly ? op : undefined }}
        >
          <fieldset>
            <legend className="font-medium">Decision (DPO)</legend>
            {(["PROCEED_FULL", "PRE_ASSESSMENT_SUFFICIENT"] as const).map((d) => (
              <label key={d} className="mt-1 flex items-center gap-2">
                <input type="radio" name="sd" className="h-4 w-4" checked={decision === d} onChange={() => setDecision(d)} />
                {SCREENING_DECISION_LABEL[d]}
              </label>
            ))}
          </fieldset>
          <TextArea label="Rationale (always required)" value={rationale} onChange={setRationale} />
          <TextArea label="DPO advice or recommendations (optional)" value={advice} onChange={setAdvice} rows={2} />
          {preOnly ? (
            <>
              {indicated ? (
                <>
                  <p className="rounded border border-amber-400 bg-amber-50 p-2 text-amber-950">
                    Screening indicated a full DPIA. Recording that the pre-assessment is sufficient is an exception: it needs a justification and the relevant mitigation controls.
                  </p>
                  <TextArea label="Exception justification" value={exc} onChange={setExc} />
                  <TextArea label="Relevant mitigation controls" value={mit} onChange={setMit} />
                </>
              ) : null}
              <p className="font-medium">Short formal opinion (recorded in the same action)</p>
              <label className="block">
                Opinion category
                <select className="input mt-1" value={cat} onChange={(e) => setCat(e.target.value)}>
                  {Object.entries(OPINION_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <TextArea label="Opinion" value={op} onChange={setOp} />
            </>
          ) : null}
        </Form>
      ) : null}
      {roles.otherDpo && s.screeningStatus === "AWAITING_DPO" ? <p className="help-text">Only {gov.dpoName}, the assigned DPO, can record this decision. You can view and comment.</p> : null}

      {gov.screeningDecisions.length ? (
        <div>
          <h3 className="font-semibold">Screening decisions (history)</h3>
          <ul className="mt-1 space-y-2">
            {gov.screeningDecisions.map((d) => (
              <li key={d.id} className={`rounded border p-2 ${d.superseded ? "border-slate-200 bg-slate-50 text-ink-soft" : "border-slate-300 bg-white"}`}>
                <p>
                  <strong>{SCREENING_DECISION_LABEL[d.decision as keyof typeof SCREENING_DECISION_LABEL]}</strong> — {d.dpoName}, {formatTime(d.createdAt)}
                  {d.superseded ? <span className="chip-neutral ml-2">Superseded</span> : null}
                </p>
                <p className="whitespace-pre-wrap">{d.rationale}</p>
                {d.exceptionJustification ? <p className="whitespace-pre-wrap"><strong>Exception:</strong> {d.exceptionJustification}</p> : null}
                {d.mitigationControls ? <p className="whitespace-pre-wrap"><strong>Mitigation controls:</strong> {d.mitigationControls}</p> : null}
                {d.advice ? <p className="whitespace-pre-wrap"><strong>Advice:</strong> {d.advice}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------------ full review gate

function FullReviewCard({ gov }: { gov: GovernanceData }) {
  const { page } = useStoreCtx();
  const roles = rolesOf(page.actor, page.ctx);
  const s = gov.state;
  const draftish = s.lifecycle === "DRAFT" || s.lifecycle === "CHANGES_REQUESTED";
  const [comment, setComment] = useState("");
  const [cat, setCat] = useState("RECOMMENDATIONS");
  const [text, setText] = useState("");
  const [recs, setRecs] = useState("");
  const [reason, setReason] = useState("");
  const [blockSub, setBlockSub] = useState("");
  const [resolve, setResolve] = useState<Record<string, string>>({});
  const [respond, setRespond] = useState<Record<string, string>>({});
  const showFull = s.path === "FULL";
  const catSelect = (
    <label className="block">
      Opinion category (a workflow label, not an automated legal conclusion)
      <select className="input mt-1" value={cat} onChange={(e) => setCat(e.target.value)}>
        {Object.entries(OPINION_LABEL).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  if (!showFull && gov.opinions.length === 0) {
    return (
      <Card title="Gate 2: full-assessment review">
        <p>{s.path === "PRE_ONLY" ? "Not applicable: the screening ended the assessment at the pre-assessment." : "Available after the DPO decides that a full assessment should proceed."}</p>
      </Card>
    );
  }
  return (
    <Card title="Gate 2: full-assessment review">
      {roles.owner && showFull && draftish ? (
        <>
          <Blockers items={gov.fullBlockers} />
          <p className="help-text">Submitting saves a read-only snapshot of the whole assessment and locks substantive editing. Comments stay open.</p>
          <Do body={{ action: "submitFull" }} primary disabled={gov.fullBlockers.length > 0}>
            Submit for full DPO review
          </Do>
        </>
      ) : null}
      {roles.owner && s.lifecycle === "IN_DPO_REVIEW" ? (
        <Do body={{ action: "withdrawFull" }}>Withdraw for editing</Do>
      ) : null}

      {roles.assignedDpo && s.lifecycle === "IN_DPO_REVIEW" ? (
        <>
          <Form action="requestChanges" submit="Request changes" valid={comment.trim() !== ""} fields={{ comment }}>
            <TextArea label="Request changes (a comment is required)" value={comment} onChange={setComment} rows={2} />
          </Form>
          <Form action="submitOpinion" submit="Submit formal opinion" valid={text.trim() !== ""} fields={{ category: cat, opinionText: text, recommendations: recs || undefined }}>
            {catSelect}
            <TextArea label="Opinion, conclusions and recommendations" value={text} onChange={setText} />
            <TextArea label="Recommendations / conditions (optional)" value={recs} onChange={setRecs} rows={2} />
            <p className="help-text">You can submit an opinion even if issues are unresolved. Once submitted it cannot be edited; a later amendment is a new recorded version.</p>
          </Form>
        </>
      ) : null}
      {roles.otherDpo && s.lifecycle === "IN_DPO_REVIEW" ? <p className="help-text">Only {gov.dpoName}, the assigned DPO, records the formal review. You can view and comment.</p> : null}

      {roles.assignedDpo && (s.lifecycle === "IN_DPO_REVIEW" || s.lifecycle === "AWAITING_OWNER_DECISION") ? (
        <Form action="raiseBlocking" submit="Mark as blocking" valid={reason.trim() !== ""} fields={{ reason, subsectionId: blockSub || undefined }} reset={() => setReason("")}>
          <TextArea label="Raise a blocking issue (a reason is required)" value={reason} onChange={setReason} rows={2} />
          <label className="block">
            Related section (optional)
            <select className="input mt-1" value={blockSub} onChange={(e) => setBlockSub(e.target.value)}>
              <option value="">Whole assessment</option>
              {SUBSECTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {subsectionLabel(x.id)} {x.title}
                </option>
              ))}
            </select>
          </label>
        </Form>
      ) : null}

      {gov.blocking.length ? (
        <div>
          <h3 className="font-semibold">Blocking issues</h3>
          <ul className="mt-1 space-y-2">
            {gov.blocking.map((b) => (
              <li key={b.id} className={`rounded border p-2 ${b.status === "OPEN" ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                <p>
                  <span className={b.status === "OPEN" ? "chip-bad" : "chip-neutral"}>{b.status === "OPEN" ? "Blocking" : "Resolved"}</span>{" "}
                  {b.subsectionId ? <em>{subsectionLabel(b.subsectionId)} </em> : null}— raised by {b.raisedByName}, {formatTime(b.raisedAt)}
                </p>
                <p className="whitespace-pre-wrap">{b.reason}</p>
                {b.ownerResponse ? <p className="whitespace-pre-wrap"><strong>Owner’s response (disagreement is preserved):</strong> {b.ownerResponse}</p> : null}
                {b.status === "RESOLVED" ? <p className="whitespace-pre-wrap"><strong>Resolved by {b.resolvedByName}:</strong> {b.resolutionNote}</p> : null}
                {b.status === "OPEN" && roles.owner ? (
                  <div className="mt-1 flex gap-2">
                    <input aria-label="Your response" className="input" placeholder="Record your response or disagreement" value={respond[b.id] ?? ""} onChange={(e) => setRespond({ ...respond, [b.id]: e.target.value })} />
                    <Do body={{ action: "respondBlocking", issueId: b.id, response: respond[b.id] ?? "" }} disabled={!(respond[b.id] ?? "").trim()}>
                      Record response
                    </Do>
                  </div>
                ) : null}
                {b.status === "OPEN" && roles.assignedDpo ? (
                  <div className="mt-1 flex gap-2">
                    <input aria-label="How it was resolved" className="input" placeholder="How was it resolved?" value={resolve[b.id] ?? ""} onChange={(e) => setResolve({ ...resolve, [b.id]: e.target.value })} />
                    <Do body={{ action: "resolveBlocking", issueId: b.id, resolutionNote: resolve[b.id] ?? "" }} disabled={!(resolve[b.id] ?? "").trim()}>
                      Resolve
                    </Do>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="help-text">A blocking issue stays blocking until the assigned DPO resolves it. The owner’s response never resolves it.</p>
        </div>
      ) : null}

      <OpinionHistory gov={gov} />

      {roles.assignedDpo && gov.state.latestOpinion && ["AWAITING_OWNER_DECISION", "AWAITING_CONDITIONS", "FINALISED"].includes(s.lifecycle) ? (
        <Form action="amendOpinion" submit="Record amended opinion" valid={text.trim() !== ""} fields={{ category: cat, opinionText: text, recommendations: recs || undefined }}>
          <p className="font-medium">Amend the opinion</p>
          <p className="help-text">An amendment is saved as a new version that supersedes the earlier opinion. The earlier opinion is never changed.</p>
          {catSelect}
          <TextArea label="Amended opinion" value={text} onChange={setText} />
          <TextArea label="Recommendations / conditions (optional)" value={recs} onChange={setRecs} rows={2} />
        </Form>
      ) : null}
    </Card>
  );
}

function OpinionHistory({ gov }: { gov: GovernanceData }) {
  if (gov.opinions.length === 0) return null;
  return (
    <div>
      <h3 className="font-semibold">Formal DPO opinions (read-only history)</h3>
      <ul className="mt-1 space-y-2">
        {gov.opinions.map((o) => (
          <li key={o.id} className={`rounded border p-2 ${o.superseded || o.earlierScreeningCycle ? "border-slate-200 bg-slate-50 text-ink-soft" : "border-slate-300 bg-white"}`}>
            <p>
              <strong>{OPINION_LABEL[o.category]}</strong> — {o.dpoName}, {formatTime(o.createdAt)} ({o.kind === "SCREENING" ? "screening opinion" : "full review"})
              {o.supersedesId ? <span className="chip-neutral ml-2">Amendment</span> : null}
              {o.superseded ? <span className="chip-neutral ml-2">Superseded</span> : null}
              {o.earlierScreeningCycle ? <span className="chip-warn ml-2">Earlier screening cycle</span> : null}
            </p>
            {o.earlierScreeningCycle ? <p className="text-ink-soft">Historical only: the screening was reopened after this opinion. It does not count for the current screening cycle.</p> : null}
            <p className="whitespace-pre-wrap">{o.opinionText}</p>
            {o.recommendations ? <p className="whitespace-pre-wrap"><strong>Recommendations:</strong> {o.recommendations}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ owner decision and conditions

interface CondRow {
  description: string;
  kind: "user" | "text";
  userId: string;
  text: string;
  deadline: string;
}

function DecisionCard({ gov }: { gov: GovernanceData }) {
  const { page } = useStoreCtx();
  const roles = rolesOf(page.actor, page.ctx);
  const s = gov.state;
  const [decision, setDecision] = useState<"APPROVED" | "CONDITIONALLY_APPROVED" | "REJECTED">("APPROVED");
  const [rationale, setRationale] = useState("");
  const [departs, setDeparts] = useState(false);
  const [departWhy, setDepartWhy] = useState("");
  const [rows, setRows] = useState<CondRow[]>([{ description: "", kind: "text", userId: "", text: "", deadline: "" }]);
  const op = s.latestOpinion;
  const mustDepart = (op === "RECOMMENDATIONS" && decision === "APPROVED") || (op === "OBJECTIONS_REMAIN" && decision !== "REJECTED");
  const conds = decision === "CONDITIONALLY_APPROVED" ? rows.map((r) => ({ description: r.description, responsibleUserId: r.kind === "user" ? r.userId || null : null, responsibleText: r.kind === "text" ? r.text || null : null, deadline: r.deadline || null })) : undefined;
  const condsOk = decision !== "CONDITIONALLY_APPROVED" || (rows.length > 0 && rows.every((r) => r.description.trim() && (r.kind === "user" ? r.userId : r.text.trim()) && r.deadline));
  const valid = rationale.trim() !== "" && condsOk && (!(mustDepart || departs) || (departs && departWhy.trim() !== ""));
  const set = (i: number, p: Partial<CondRow>) => setRows(rows.map((r, n) => (n === i ? { ...r, ...p } : r)));

  return (
    <Card title="Owner decision">
      {gov.ownerDecisions.length ? (
        <ul className="space-y-2">
          {gov.ownerDecisions.map((d) => (
            <li key={d.id} className="rounded border border-slate-300 bg-white p-2">
              <p>
                <strong>{DECISION_LABEL[d.decision as keyof typeof DECISION_LABEL]}</strong> — {d.ownerName}, {formatTime(d.createdAt)}
                {d.supersedesId ? <span className="chip-neutral ml-2">After conditions confirmed</span> : null}
              </p>
              <p className="whitespace-pre-wrap">{d.rationale}</p>
              {d.departsFromDpo ? (
                <p className="whitespace-pre-wrap rounded border border-amber-400 bg-amber-50 p-2 text-amber-950">
                  <strong>The owner departs from the DPO’s opinion and accepts the risk:</strong> {d.departureRationale}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>No decision recorded yet. The process owner decides after the DPO review. The recorded decision is a human decision, not a software certification.</p>
      )}
      {roles.owner && s.lifecycle === "AWAITING_OWNER_DECISION" ? (
        <>
          {s.openBlocking > 0 ? <p className="rounded border border-red-300 bg-red-50 p-2 text-red-950">A DPO blocking issue is open. You can reject, or wait until the assigned DPO resolves it. Risk acceptance does not mark a mandatory step as satisfied.</p> : null}
          <Form
            action="ownerDecision"
            submit="Record decision"
            valid={valid}
            confirm="Record this decision? It cannot be edited afterwards; corrections are recorded as new entries."
            fields={{ decision, rationale, departsFromDpo: departs || undefined, departureRationale: departWhy || undefined, conditions: conds }}
          >
            <fieldset>
              <legend className="font-medium">Final decision</legend>
              {(["APPROVED", "CONDITIONALLY_APPROVED", "REJECTED"] as const).map((d) => (
                <label key={d} className="mt-1 flex items-center gap-2">
                  <input type="radio" name="od" className="h-4 w-4" checked={decision === d} onChange={() => setDecision(d)} />
                  {DECISION_LABEL[d]}
                </label>
              ))}
            </fieldset>
            <TextArea label="Rationale (required)" value={rationale} onChange={setRationale} />
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={departs || mustDepart} onChange={(e) => setDeparts(e.target.checked)} disabled={mustDepart} />
              I depart from the DPO’s opinion and accept the documented risk{mustDepart ? " (required for this decision)" : ""}
            </label>
            {op === "RECOMMENDATIONS" && decision === "CONDITIONALLY_APPROVED" ? (
              <p className="text-ink-soft" data-testid="dpo-recommendation-reminder">
                If any DPO recommendation remains unaddressed, tick ‘I depart from the DPO’s opinion’ and explain why.
              </p>
            ) : null}
            {departs || mustDepart ? <TextArea label="Why you depart from the DPO’s opinion, and the risk you accept" value={departWhy} onChange={(v) => { setDeparts(true); setDepartWhy(v); }} /> : null}
            {decision === "CONDITIONALLY_APPROVED" ? (
              <div className="space-y-2">
                <p className="font-medium">Conditions (description, who is responsible, deadline)</p>
                {rows.map((r, i) => (
                  <div key={i} className="space-y-1 rounded border border-slate-300 bg-white p-2">
                    <input className="input" aria-label={`Condition ${i + 1} description`} placeholder={`Condition ${i + 1}`} value={r.description} onChange={(e) => set(i, { description: e.target.value })} />
                    <div className="flex flex-wrap gap-2">
                      <select className="input w-44" aria-label={`Condition ${i + 1} responsible type`} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as "user" | "text" })}>
                        <option value="text">Role / person (free text)</option>
                        <option value="user">Demo user</option>
                      </select>
                      {r.kind === "user" ? (
                        <select className="input w-56" aria-label={`Condition ${i + 1} responsible`} value={r.userId} onChange={(e) => set(i, { userId: e.target.value })}>
                          <option value="">Choose…</option>
                          {gov.people.assignable.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input className="input w-56" aria-label={`Condition ${i + 1} responsible`} placeholder="Role or person" value={r.text} onChange={(e) => set(i, { text: e.target.value })} />
                      )}
                      <input type="date" className="input w-44" aria-label={`Condition ${i + 1} deadline`} value={r.deadline} onChange={(e) => set(i, { deadline: e.target.value })} />
                      {rows.length > 1 ? (
                        <button type="button" className="btn-link text-red-800" onClick={() => setRows(rows.filter((_, n) => n !== i))}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                <button type="button" className="btn-link" onClick={() => setRows([...rows, { description: "", kind: "text", userId: "", text: "", deadline: "" }])}>
                  + Add a condition
                </button>
                <p className="help-text">A free-text person receives no notifications; the owner is notified about overdue items instead. Naming someone does not give them access.</p>
              </div>
            ) : null}
          </Form>
          {s.path === "FULL" ? (
            <div>
              <p className="help-text">If answers need to change, reopen for changes. The reviewed snapshot and the DPO’s opinion are preserved, and renewed DPO review is required.</p>
              <Do body={{ action: "reopenForChanges" }} confirm="Reopen for changes? You will need to submit again for a renewed DPO review.">
                Reopen for changes
              </Do>
            </div>
          ) : null}
        </>
      ) : null}
      {roles.owner && s.lifecycle === "AWAITING_CONDITIONS" ? (
        <div>
          <p className="help-text">Substantive changes to answers still need a renewed DPO review.</p>
          <Do body={{ action: "reopenForChanges" }} confirm="Reopen for changes? You will need to submit again for a renewed DPO review.">
            Reopen for changes
          </Do>
        </div>
      ) : null}
    </Card>
  );
}

const MEASURE_STATUS_LABEL: Record<string, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETED: "Completed" };

function ConditionsCard({ gov }: { gov: GovernanceData }) {
  const { page } = useStoreCtx();
  const roles = rolesOf(page.actor, page.ctx);
  const [note, setNote] = useState<Record<string, string>>({});
  const [prog, setProg] = useState<Record<string, { status: string; note: string }>>({});
  const awaiting = gov.state.lifecycle === "AWAITING_CONDITIONS";
  const canProgress = ["DRAFT", "CHANGES_REQUESTED", "AWAITING_OWNER_DECISION", "AWAITING_CONDITIONS", "FINALISED"].includes(gov.state.lifecycle);
  if (gov.conditions.length === 0 && gov.measures.length === 0) return null;
  return (
    <Card title="Conditions and progress">
      <p className="help-text">
        Progress updates are separate timestamped records. They never change a submitted snapshot, a risk score or a decision. Only the owner’s confirmation completes a condition.
      </p>
      {gov.conditions.length ? (
        <div>
          <h3 className="font-semibold">Approval conditions</h3>
          <ul className="mt-1 space-y-2">
            {gov.conditions.map((c) => (
              <li key={c.id} className="rounded border border-slate-300 bg-white p-2">
                <p>
                  <strong>{c.description}</strong> {c.confirmedAt ? <span className="chip-good ml-1">Confirmed by owner</span> : <span className="chip-warn ml-1">Open</span>}
                  {c.overdue ? <span className="chip-bad ml-1">Overdue since {c.deadline}</span> : null}
                </p>
                <p className="text-ink-soft">
                  Responsible: {c.responsibleName} · Deadline: {c.deadline ?? "none"}
                </p>
                {c.confirmationNote ? <p>Owner’s confirmation: {c.confirmationNote}</p> : null}
                {c.progress.length ? (
                  <ul className="mt-1 list-disc pl-5">
                    {c.progress.map((p, i) => (
                      <li key={i}>
                        {formatTime(p.createdAt)} — {p.authorName}: {p.status ? `[${p.status}] ` : ""}
                        {p.note}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {awaiting && !c.confirmedAt && (roles.owner || c.responsibleUserId === page.actor.id) ? (
                  <ProgressForm itemType="CONDITION" itemId={c.id} state={prog[c.id]} setState={(v) => setProg({ ...prog, [c.id]: v })} />
                ) : null}
                {awaiting && !c.confirmedAt && roles.owner ? (
                  <div className="mt-2 flex gap-2">
                    <input aria-label="Confirmation note" className="input" placeholder="Evidence you have seen (optional)" value={note[c.id] ?? ""} onChange={(e) => setNote({ ...note, [c.id]: e.target.value })} />
                    <Do body={{ action: "confirmCondition", conditionId: c.id, note: note[c.id] || undefined }} primary confirm="Confirm this condition as complete? When all conditions are confirmed the assessment becomes Approved.">
                      Confirm complete
                    </Do>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {gov.measures.length ? (
        <div>
          <h3 className="font-semibold">Risk measures</h3>
          <ul className="mt-1 space-y-2">
            {gov.measures.map((m) => (
              <li key={m.id} className="rounded border border-slate-300 bg-white p-2">
                <p>
                  <strong>{m.riskName}:</strong> {m.description || "(no description)"}
                  {m.overdue ? <span className="chip-bad ml-2">Overdue since {m.due}</span> : null}
                </p>
                <p className="text-ink-soft">
                  Responsible: {m.responsibleName} · Due: {m.due || "none"}
                </p>
                <p className="text-ink-soft">
                  <strong>{["AWAITING_CONDITIONS", "FINALISED"].includes(gov.state.lifecycle) ? "Status at decision" : "Status in the register"}:</strong>{" "}
                  {MEASURE_STATUS_LABEL[m.registerStatus] ?? "not set"} · <strong>Latest recorded status:</strong>{" "}
                  {m.latestRecordedStatus ? (MEASURE_STATUS_LABEL[m.latestRecordedStatus] ?? m.latestRecordedStatus) : "no progress recorded"}
                </p>
                {m.progress.length ? (
                  <ul className="mt-1 list-disc pl-5">
                    {m.progress.map((p, i) => (
                      <li key={i}>
                        {formatTime(p.createdAt)} — {p.authorName}: {p.status ? `[${p.status}] ` : ""}
                        {p.note}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canProgress && (roles.owner || m.responsibleUserId === page.actor.id) ? (
                  <ProgressForm itemType="MEASURE" itemId={m.id} state={prog[m.id]} setState={(v) => setProg({ ...prog, [m.id]: v })} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function ProgressForm({ itemType, itemId, state, setState }: { itemType: "CONDITION" | "MEASURE"; itemId: string; state?: { status: string; note: string }; setState: (v: { status: string; note: string }) => void }) {
  const v = state ?? { status: "IN_PROGRESS", note: "" };
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs">
        Status
        <select className="input w-40" value={v.status} onChange={(e) => setState({ ...v, status: e.target.value })}>
          <option value="NOT_STARTED">Not started</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </label>
      <label className="min-w-[14rem] flex-1 text-xs">
        Progress note or evidence
        <input className="input" value={v.note} maxLength={4000} onChange={(e) => setState({ ...v, note: e.target.value })} />
      </label>
      <Do body={{ action: "recordProgress", itemType, itemId, status: v.status, note: v.note }} disabled={!v.note.trim()}>
        Record progress
      </Do>
    </div>
  );
}

export function ReviewPanel({ gov }: { gov: GovernanceData }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Review and decisions</h1>
      <StatusCard gov={gov} />
      <ScreeningCard gov={gov} />
      <FullReviewCard gov={gov} />
      <DecisionCard gov={gov} />
      <ConditionsCard gov={gov} />
    </div>
  );
}

// ------------------------------------------------------------------ team and sharing

export function TeamPanel({ gov }: { gov: GovernanceData }) {
  const { page } = useStoreCtx();
  const roles = rolesOf(page.actor, page.ctx);
  const [assignee, setAssignee] = useState("");
  const [subs, setSubs] = useState<string[]>([]);
  const [task, setTask] = useState("");
  const [deadline, setDeadline] = useState("");
  const [share, setShare] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [keep, setKeep] = useState(true);
  const assignable = SUBSECTIONS.filter((x) => !NON_ASSIGNABLE.includes(x.id));
  const toggle = (id: string) => setSubs((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const archived = gov.state.lifecycle === "ARCHIVED";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Team and sharing</h1>
      <Card title="Who can do what">
        <p>
          Owner: <strong>{gov.ownerName}</strong>. Assigned DPO: <strong>{gov.dpoName}</strong> (reads and comments; records the formal review; never edits owner answers). Only the demo administrator can
          reassign the DPO.
        </p>
        <p className="help-text">Assigning a section, sharing view access and naming a responsible person are three separate actions. Naming someone as responsible does not give them access.</p>
      </Card>

      <Card title="Section assignments">
        {gov.assignments.length === 0 ? <p>No sections are assigned.</p> : null}
        <ul className="space-y-2">
          {gov.assignments.map((a) => (
            <li key={a.id} className={`rounded border p-2 ${a.status === "CANCELLED" ? "border-slate-200 bg-slate-50 text-ink-soft" : "border-slate-300 bg-white"}`}>
              <p>
                <strong>{a.assigneeName}</strong> <span className="chip-neutral ml-1">{a.status === "PENDING" ? "Pending" : a.status === "IN_PROGRESS" ? "In progress" : a.status === "COMPLETED" ? "Completed" : "Cancelled"}</span>
                {a.overdue ? <span className="chip-bad ml-1">Overdue since {a.deadline}</span> : null}
              </p>
              <p>{a.taskDescription}</p>
              <p className="text-ink-soft">
                Sections: {a.subsectionIds.map((s) => subsectionLabel(s)).join(", ")}
                {a.deadline ? ` · Deadline: ${a.deadline}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {a.assigneeId === page.actor.id && a.status === "PENDING" ? <Do body={{ action: "setAssignmentStatus", assignmentId: a.id, status: "IN_PROGRESS" }}>Start</Do> : null}
                {a.assigneeId === page.actor.id && (a.status === "PENDING" || a.status === "IN_PROGRESS") ? (
                  <Do body={{ action: "setAssignmentStatus", assignmentId: a.id, status: "COMPLETED" }} confirm="Mark this assignment complete? You will no longer be able to edit these sections unless the owner reopens it. Completing is a task status, not an approval.">
                    Mark complete
                  </Do>
                ) : null}
                {roles.owner && a.status === "COMPLETED" ? <Do body={{ action: "updateAssignment", assignmentId: a.id, status: "PENDING" }}>Reopen</Do> : null}
                {roles.owner && a.status !== "CANCELLED" ? (
                  <Do body={{ action: "updateAssignment", assignmentId: a.id, status: "CANCELLED" }} danger confirm="Cancel this assignment? The person loses access unless another assignment, sharing or role still gives it.">
                    Cancel assignment
                  </Do>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {roles.owner && !archived ? (
          <Form action="createAssignment" submit="Assign sections" valid={Boolean(assignee) && subs.length > 0 && task.trim() !== ""} fields={{ assigneeId: assignee, subsectionIds: subs, taskDescription: task, deadline: deadline || null }}>
            <p className="font-medium">Assign sections to a person</p>
            <label className="block">
              Person
              <select className="input mt-1" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Choose…</option>
                {gov.people.assignable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.title}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-1">
              <legend className="font-medium">Sections</legend>
              <button type="button" className="btn-link" onClick={() => setSubs(subs.length === assignable.length ? [] : assignable.map((x) => x.id))}>
                {subs.length === assignable.length ? "Clear all" : "Select all assignable sections"}
              </button>
              {STAGES.map((st) => {
                const list = st.subsections.filter((x) => !NON_ASSIGNABLE.includes(x.id));
                if (!list.length) return null;
                const allOn = list.every((x) => subs.includes(x.id));
                return (
                  <div key={st.id} className="rounded border border-slate-200 bg-white p-2">
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" className="h-4 w-4" checked={allOn} onChange={() => setSubs((s) => (allOn ? s.filter((x) => !list.some((l) => l.id === x)) : [...new Set([...s, ...list.map((l) => l.id)])]))} />
                      {stageNumber(st.id)}. {st.title}
                    </label>
                    <div className="ml-6 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {list.map((x) => (
                        <label key={x.id} className="flex items-center gap-1.5">
                          <input type="checkbox" className="h-4 w-4" checked={subs.includes(x.id)} onChange={() => toggle(x.id)} />
                          {subsectionLabel(x.id)} {x.title}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="help-text">Decisions, the DPO’s screening decision and opinion, the review schedule and the version history cannot be assigned.</p>
            </fieldset>
            <label className="block">
              Task description
              <input className="input mt-1" value={task} maxLength={2000} onChange={(e) => setTask(e.target.value)} />
            </label>
            <label className="block">
              Deadline (optional)
              <input type="date" className="input mt-1 w-48" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </Form>
        ) : null}
      </Card>

      {roles.owner ? (
        <Card title="Explicit sharing (view access)">
          <p className="help-text">Sharing gives read-only access, with no editing and no commenting. It is recorded in the history.</p>
          {gov.access.length ? (
            <ul className="space-y-1">
              {gov.access.map((x) => (
                <li key={x.userId} className="flex items-center gap-3">
                  {x.name}
                  <Do body={{ action: "revokeAccess", userId: x.userId }} danger confirm={`Remove view access for ${x.name}?`}>
                    Remove access
                  </Do>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nobody has been given explicit view access.</p>
          )}
          {!archived ? (
            <Form action="grantAccess" submit="Give view access" valid={Boolean(share)} fields={{ userId: share }} reset={() => setShare("")}>
              <label className="block">
                Give read-only access to
                <select className="input mt-1" value={share} onChange={(e) => setShare(e.target.value)}>
                  <option value="">Choose…</option>
                  {gov.people.shareable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="help-text">DPO users can already see every assessment. People assigned a section can already read the whole assessment.</p>
            </Form>
          ) : null}
        </Card>
      ) : null}

      {roles.owner && !archived ? (
        <Card title="Transfer ownership">
          <p className="help-text">Ownership can be transferred to another process owner. The transfer is recorded in the history. The assigned DPO cannot become the owner.</p>
          <Form action="transferOwnership" submit="Transfer ownership" valid={Boolean(newOwner)} fields={{ newOwnerId: newOwner, keepAsViewer: keep }} confirm="Transfer ownership? You will stop being the owner and lose owner permissions.">
            <label className="block">
              New owner
              <select className="input mt-1" value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
                <option value="">Choose…</option>
                {gov.people.owners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Keep me as a read-only viewer (an explicit, logged share)
            </label>
          </Form>
        </Card>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ history and versions

export function HistoryPanel({ gov }: { gov: GovernanceData }) {
  const { page } = useStoreCtx();
  const roles = rolesOf(page.actor, page.ctx);
  const s = gov.state;
  const [reason, setReason] = useState("");
  const [desc, setDesc] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [sure, setSure] = useState(false);
  const toggle = (c: string) => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">History and versions</h1>

      <Card title="Versions">
        <ul className="space-y-2">
          {gov.versions.map((v) => (
            <li key={v.id} className="rounded border border-slate-300 bg-white p-2">
              <p>
                <strong>Version {v.versionNumber}</strong> {v.current ? <span className="chip-good ml-1">Current</span> : null}{" "}
                <span className={v.rejected ? "chip-bad ml-1" : "chip-neutral ml-1"}>{v.kind === "FINALISED" ? (v.rejected ? "Finalised — Rejected" : "Finalised") : "Draft"}</span> · started {formatTime(v.createdAt)}
              </p>
              {v.reason ? <p>Reason: {v.reason}</p> : <p className="text-ink-soft">Initial draft</p>}
              {v.changeDescription ? <p>Changes: {v.changeDescription}</p> : null}
              {v.categories.length ? <p className="text-ink-soft">Categories: {v.categories.join(", ")}</p> : null}
              <ul className="mt-1 list-disc pl-5">
                {gov.snapshots
                  .filter((sn) => sn.versionNumber === v.versionNumber)
                  .map((sn) => (
                    <li key={sn.id}>
                      <a className="btn-link" href={`/assessments/${page.assessment.id}/versions/${sn.id}`}>
                        {sn.kind === "SCREENING_SUBMITTED" ? "Screening snapshot" : sn.kind === "FULL_SUBMITTED" ? "Submitted snapshot" : "Finalised snapshot"}
                      </a>{" "}
                      — {formatTime(sn.takenAt)} by {sn.takenByName} · fingerprint {sn.hash}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="help-text">Snapshots are read-only. Earlier versions, opinions and decisions stay with the version they belong to.</p>
      </Card>

      {roles.owner && s.lifecycle === "FINALISED" ? (
        <Card title="Start review / update">
          <p className="help-text">
            This keeps the finalised version, creates a new draft revision with copied answers, and marks every section “Carried forward — please review”. Earlier approvals and DPO opinions are not carried
            forward, and you must revisit the pre-assessment.
          </p>
          <Form action="startRevision" submit="Start new revision" valid={reason.trim() !== "" && desc.trim() !== ""} fields={{ reason, changeDescription: desc, categories: cats }}>
            <label className="block">
              Reason for the review or update
              <input className="input mt-1" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
            </label>
            <TextArea label="Description of the changes" value={desc} onChange={setDesc} />
            <fieldset>
              <legend className="font-medium">What changed?</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {CHANGE_CATEGORIES.map((c) => (
                  <label key={c.value} className="flex items-center gap-1.5">
                    <input type="checkbox" className="h-4 w-4" checked={cats.includes(c.value)} onChange={() => toggle(c.value)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </Form>
        </Card>
      ) : null}

      {gov.unreviewed.length > 0 ? (
        <Card title="Carried-forward sections to review">
          <p>{gov.unreviewed.length} section{gov.unreviewed.length === 1 ? "" : "s"} still marked “Carried forward — please review”. Open each section and confirm it has been reviewed; submission is blocked until you do.</p>
        </Card>
      ) : null}

      {roles.owner ? (
        <Card title="Archive and deletion">
          {s.lifecycle === "ARCHIVED" ? (
            <>
              <p>This assessment is archived and read-only. It can be found with the “Show archived only” filter in the register.</p>
              <Do body={{ action: "restore" }} primary>
                Restore from the archive
              </Do>
            </>
          ) : (
            <>
              <p className="help-text">Archiving keeps everything, hides the assessment from the normal register views and makes it read-only. You can restore it later.</p>
              <Do body={{ action: "archive" }} confirm="Archive this assessment? It becomes read-only until you restore it.">
                Archive
              </Do>
            </>
          )}
          {!s.everSubmitted && s.lifecycle === "DRAFT" ? (
            <div className="rounded border border-red-300 bg-red-50 p-2">
              <p className="font-medium text-red-950">Delete this draft</p>
              <p>Only a draft that has never been submitted can be deleted. This permanently removes it and cannot be undone.</p>
              <label className="mt-1 flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={sure} onChange={(e) => setSure(e.target.checked)} />I understand this is permanent
              </label>
              <div className="mt-2">
                <Do body={{ action: "deleteDraft", confirm: true }} danger disabled={!sure} confirm="Permanently delete this draft?" onDone={() => (window.location.href = "/assessments")}>
                  Delete draft permanently
                </Do>
              </div>
            </div>
          ) : (
            <p className="help-text">{s.everSubmitted ? "This assessment has been submitted, so it can only be archived, not deleted." : "Only a draft can be deleted."}</p>
          )}
        </Card>
      ) : null}

      <Card title="Activity history">
        <ol className="space-y-1">
          {gov.events.map((e) => (
            <li key={e.id}>
              <span className="text-ink-soft">{formatTime(e.createdAt)}</span> — {e.summary} <span className="text-ink-soft">({e.actorName})</span>
            </li>
          ))}
        </ol>
        <p className="help-text">Significant events only. Individual keystrokes are not logged.</p>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ compact status inside the questionnaire

export function GovStatus({ kind }: { kind: "screening" | "opinion" | "decision" }) {
  const { page } = useStoreCtx();
  const { unreviewed } = useCollab();
  const [gov, setGov] = useState<GovernanceData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/assessments/${page.assessment.id}/governance`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { gov: GovernanceData }) => live && setGov(d.gov))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [page.assessment.id, page.assessment.lifecycle, page.assessment.screeningStatus]);
  void unreviewed;
  const link = (
    <a className="btn-link" href={`/assessments/${page.assessment.id}/review`}>
      Open Review and decisions
    </a>
  );
  if (failed) return <p className="text-sm">Could not load the review status. {link}</p>;
  if (!gov) return <p className="help-text">Loading review status…</p>;
  const sd = [...gov.screeningDecisions].reverse().find((d) => !d.superseded);
  const op = [...gov.opinions].reverse().find((o) => !o.superseded && !o.earlierScreeningCycle);
  const earlier = [...gov.opinions].reverse().find((o) => !o.superseded && o.earlierScreeningCycle);
  const od = [...gov.ownerDecisions].reverse()[0];
  return (
    <div className="max-w-prose2 space-y-1 rounded-md border border-slate-200 bg-white p-3 text-sm">
      {kind === "screening" ? (
        sd ? (
          <p>
            <strong>{SCREENING_DECISION_LABEL[sd.decision as keyof typeof SCREENING_DECISION_LABEL]}</strong> — {sd.dpoName}, {formatTime(sd.createdAt)}. {sd.rationale.slice(0, 200)}
          </p>
        ) : (
          <p>{SCREENING_LABEL[gov.state.screeningStatus] ?? gov.state.screeningStatus}. No DPO screening decision is recorded yet.</p>
        )
      ) : null}
      {kind === "opinion" ? (
        op ? (
          <p>
            <strong>{OPINION_LABEL[op.category]}</strong> — {op.dpoName}, {formatTime(op.createdAt)}. {op.opinionText.slice(0, 240)}
          </p>
        ) : (
          <p>No formal DPO opinion is recorded yet{earlier ? " for the current screening cycle" : ""}.</p>
        )
      ) : null}
      {kind === "opinion" && earlier ? (
        <p className="text-ink-soft" data-testid="earlier-cycle-opinion">
          <span className="chip-warn mr-2">Earlier screening cycle</span>
          {OPINION_LABEL[earlier.category]} — {earlier.dpoName}, {formatTime(earlier.createdAt)}. Historical only; it does not count for the current screening cycle.
        </p>
      ) : null}
      {kind === "decision" ? (
        od ? (
          <p>
            <strong>{DECISION_LABEL[od.decision as keyof typeof DECISION_LABEL]}</strong> — {od.ownerName}, {formatTime(od.createdAt)}. {od.rationale.slice(0, 240)}
          </p>
        ) : (
          <p>No owner decision is recorded yet.</p>
        )
      ) : null}
      <p>{link}</p>
    </div>
  );
}

void subsectionById;
