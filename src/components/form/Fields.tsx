"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { changeClassOf, type FieldDef } from "@/content";
import type { AnswerState, EvalCtx } from "@/domain/conditions";
import { evaluate } from "@/domain/conditions";
import { canEditField } from "@/domain/permissions";
import { describeRisk, riskCategory, riskScore } from "@/domain/risk";
import {
  SUGGESTED_DATA_CATEGORIES,
  SUGGESTED_DATA_SUBJECTS,
  SUGGESTED_PARTIES,
  VAGUE_CATEGORY_HINT,
  isVagueCategory,
} from "@/domain/guidance";
import { interpretYesNo } from "@/domain/model";
import { isEmptyValue } from "@/domain/validation";
import { useStoreCtx, useStoreRev } from "./context";
import type { FieldState } from "./store";

// ------------------------------------------------------------------ helpers

export function formatTime(iso?: string): string {
  if (!iso) return "";
  // Fixed time zone so server and browser render identical text (no hydration mismatch).
  const d = new Date(iso);
  return `${d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}

function AutoTextarea(props: {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  describedBy?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      id={props.id}
      rows={props.rows ?? 3}
      className="input resize-none overflow-hidden"
      value={props.value}
      disabled={props.disabled}
      aria-describedby={props.describedBy}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

const STATE_LABEL: Record<string, string> = {
  ANSWERED: "Answered",
  NOT_SURE: "Not sure — I need help",
  COMPLETE_LATER: "Complete later",
  NOT_APPLICABLE: "Not applicable",
};

export function useFormat() {
  const { store, page } = useStoreCtx();
  return (def: FieldDef, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "(empty)";
    switch (def.type) {
      case "choice":
      case "yesno":
        if (def.type === "yesno") return value === "YES" ? "Yes" : value === "NO" ? "No" : String(value);
        return def.options?.find((o) => o.value === value)?.label ?? String(value);
      case "multi":
        return Array.isArray(value)
          ? value.map((v) => def.options?.find((o) => o.value === v)?.label ?? v).join("; ") || "(empty)"
          : String(value);
      case "flag":
        return value === true ? "Ticked" : "Not ticked";
      case "quantity": {
        const q = value as { min: number; max: number };
        return q.min === q.max ? String(q.min) : `${q.min} to ${q.max}`;
      }
      case "entity":
        return store.entities.find((e) => e.id === value)?.name ?? "(removed entry)";
      case "entities":
        return Array.isArray(value)
          ? value.map((id) => store.entities.find((e) => e.id === id)?.name ?? "(removed entry)").join("; ") || "(empty)"
          : String(value);
      case "person": {
        const p = value as { userId?: string; text?: string };
        return p.userId ? (page.people.find((x) => x.id === p.userId)?.name ?? "(unknown user)") : (p.text ?? "");
      }
      default:
        return String(value);
    }
  };
}

// ------------------------------------------------------------------ field block

export function FieldBlock({
  def,
  recordId,
  subsectionId,
  evalCtx,
}: {
  def: FieldDef;
  recordId: string;
  subsectionId: string;
  evalCtx: EvalCtx;
}) {
  const { store, page } = useStoreCtx();
  useStoreRev(store);
  const uid = useId();
  const f = store.get(def.id, recordId);
  const state: AnswerState = f?.state ?? "UNANSWERED";
  const value = f?.value;
  const perm = canEditField(
    page.actor,
    page.ctx,
    { id: def.id, changeClass: changeClassOf(def), workflow: def.workflow, computed: def.type === "computed" },
    subsectionId,
  );
  const disabled = !perm.ok;
  const inputId = `${uid}-in`;
  const helpId = `${uid}-help`;
  const essentialId = def.help?.essential && def.help.inline ? helpId : undefined;
  const hints = (def.hints ?? []).filter((h) => evaluate(h.when, evalCtx, recordId));

  if (def.workflow === "system") {
    // Read-only metadata, shown compactly.
    const v = def.computed === "owner" ? page.assessment.ownerName : def.computed === "displayId" ? page.assessment.displayId : "";
    return (
      <div className="text-sm">
        <span className="text-ink-soft">{def.label}: </span>
        <strong>{v}</strong>
        {def.sourceText ? (
          <details className="mt-0.5 text-xs text-ink-soft">
            <summary className="w-fit cursor-pointer text-brand-700">Original template wording</summary>
            <p className="mt-1">{def.sourceText}</p>
          </details>
        ) : null}
      </div>
    );
  }
  if (def.workflow) {
    return (
      <div className="border-l-2 border-slate-300 pl-3">
        <p className="font-medium">{def.label}</p>
        <p className="text-sm text-ink-soft">Pending — recorded in a later stage.</p>
      </div>
    );
  }
  if (def.type === "computed") {
    return <ComputedField def={def} recordId={recordId} evalCtx={evalCtx} />;
  }

  const set = (v: unknown) => store.edit(def.id, recordId, { value: v });
  const asString = typeof value === "string" ? value : "";
  const isGroup = def.type === "yesno" || def.type === "choice" || def.type === "multi";

  const labelEl = isGroup ? (
    <legend className="label">
      {def.label}
      {def.optional ? <span className="ml-2 text-xs font-normal text-ink-soft">(optional)</span> : null}
    </legend>
  ) : (
    <label htmlFor={inputId} className="label">
      {def.label}
      {def.optional ? <span className="ml-2 text-xs font-normal text-ink-soft">(optional)</span> : null}
    </label>
  );

  const body = (
    <>
      {essentialId ? (
        <p id={helpId} className="help-text mt-1">
          {def.help?.inline}
        </p>
      ) : null}
      <HelpDetails def={def} />
      <div className="mt-2 max-w-prose2">
        {(def.type === "text" || def.type === "link") && (
          <input
            id={inputId}
            className="input"
            type="text"
            value={asString}
            disabled={disabled}
            aria-describedby={essentialId}
            aria-invalid={f?.error ? true : undefined}
            onChange={(e) => set(e.target.value)}
          />
        )}
        {def.type === "date" && (
          <input
            id={inputId}
            className="input max-w-xs"
            type="date"
            value={asString}
            disabled={disabled}
            aria-invalid={f?.error ? true : undefined}
            onChange={(e) => set(e.target.value)}
          />
        )}
        {def.type === "number" && (
          <input
            id={inputId}
            className="input max-w-xs"
            type="number"
            min={0}
            value={typeof value === "number" ? value : ""}
            disabled={disabled}
            onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
          />
        )}
        {def.type === "longtext" && (
          <AutoTextarea
            id={inputId}
            value={asString}
            disabled={disabled}
            describedBy={essentialId}
            onChange={set}
          />
        )}
        {def.type === "quantity" && <QuantityControl id={inputId} value={value} disabled={disabled} onChange={set} />}
        {def.type === "yesno" && (
          <div className="flex flex-wrap gap-4" role="presentation">
            {(["YES", "NO"] as const).map((v) => (
              <label key={v} className="inline-flex items-center gap-2 text-base">
                <input
                  type="radio"
                  name={`${uid}-yn`}
                  className="h-5 w-5"
                  checked={value === v}
                  disabled={disabled}
                  onChange={() => set(v)}
                />
                {v === "YES" ? "Yes" : "No"}
              </label>
            ))}
            {value && !disabled ? (
              <button type="button" className="btn-link" onClick={() => set("")}>
                Clear answer
              </button>
            ) : null}
          </div>
        )}
        {def.type === "choice" && (
          <div className="space-y-2">
            {def.options?.map((o) => (
              <label key={o.value} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5">
                <input
                  type="radio"
                  name={`${uid}-ch`}
                  className="mt-1 h-5 w-5 shrink-0"
                  checked={value === o.value}
                  disabled={disabled}
                  onChange={() => set(o.value)}
                />
                <span>
                  <span className="font-medium">{o.label}</span>
                  {o.description ? <span className="help-text block">{o.description}</span> : null}
                </span>
              </label>
            ))}
            {value && !disabled ? (
              <button type="button" className="btn-link" onClick={() => set("")}>
                Clear answer
              </button>
            ) : null}
          </div>
        )}
        {def.type === "multi" && (
          <div className="space-y-2">
            {def.options?.map((o) => {
              const arr = Array.isArray(value) ? (value as string[]) : [];
              const on = arr.includes(o.value);
              return (
                <label key={o.value} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0"
                    checked={on}
                    disabled={disabled}
                    onChange={() => set(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                  />
                  <span>
                    <span className="font-medium">{o.label}</span>
                    {o.description ? <span className="help-text block">{o.description}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {def.type === "flag" && (
          <label className="flex items-start gap-2">
            <input
              id={inputId}
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={value === true}
              disabled={disabled}
              onChange={(e) => set(e.target.checked)}
            />
            <span>{def.label}</span>
          </label>
        )}
        {(def.type === "entity" || def.type === "entities") && (
          <EntityPicker def={def} recordId={recordId} disabled={disabled} multiple={def.type === "entities"} />
        )}
        {def.type === "person" && <PersonControl id={inputId} value={value} disabled={disabled} onChange={set} />}
      </div>

      {def.yesMeaningText ? (
        <p className="mt-2 max-w-prose2 rounded-md border border-sky-300 bg-sky-50 p-2 text-sm text-sky-950">
          <strong>Reading this answer:</strong> {def.yesMeaningText}
          {def.type === "yesno" && (value === "YES" || value === "NO") ? (
            <>
              {" "}
              <span className="font-medium">
                Your answer “{value === "YES" ? "Yes" : "No"}”{" "}
                {interpretYesNo(def, value) === "SUPPORTS"
                  ? "supports necessity."
                  : interpretYesNo(def, value) === "WEIGHS_AGAINST"
                    ? "weighs against necessity."
                    : ""}
              </span>
            </>
          ) : null}
        </p>
      ) : null}

      {hints.map((h, i) => (
        <p key={i} className="mt-2 max-w-prose2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
          <strong>Check:</strong> {h.text}
        </p>
      ))}

      <StatePanel def={def} f={f} state={state} disabled={disabled} recordId={recordId} />
      {f?.error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-800">
          {f.error}
        </p>
      ) : null}
      {f?.status === "conflict" ? <ConflictPanel def={def} f={f} recordId={recordId} /> : null}
      <FieldMeta f={f} />
      {!perm.ok ? <p className="help-text mt-1">Read-only: {perm.reason}</p> : null}
    </>
  );

  return isGroup ? (
    <fieldset className="min-w-0">
      {labelEl}
      {body}
    </fieldset>
  ) : def.type === "flag" ? (
    <div>{body}</div>
  ) : (
    <div>
      {labelEl}
      {body}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function HelpDetails({ def }: { def: FieldDef }) {
  const h = def.help;
  const inline = h && !h.essential ? h.inline : undefined;
  if (!inline && !h?.explain && !h?.include && !h?.example && !def.sourceText) return null;
  const Part = ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <p className="font-medium text-ink">{title}</p>
      <p>{children}</p>
    </div>
  );
  return (
    <details className="mt-1 max-w-prose2 text-sm">
      <summary className="w-fit cursor-pointer text-brand-700">Guidance</summary>
      <div className="mt-1 space-y-2 border-l-2 border-slate-200 pl-3 text-ink-soft">
        {inline ? <p>{inline}</p> : null}
        {h?.explain ? <Part title="Explain this">{h.explain}</Part> : null}
        {h?.include ? <Part title="What should my answer include?">{h.include}</Part> : null}
        {h?.example ? <Part title="Example (guidance, not your answer)">{h.example}</Part> : null}
        {def.sourceText ? <Part title="Original template wording">{def.sourceText}</Part> : null}
      </div>
    </details>
  );
}

function StatePanel({
  def,
  f,
  state,
  disabled,
  recordId,
}: {
  def: FieldDef;
  f: FieldState | undefined;
  state: AnswerState;
  disabled: boolean;
  recordId: string;
}) {
  const { store } = useStoreCtx();
  const uid = useId();
  const current = state === "UNANSWERED" ? "ANSWERED" : state;
  const options: AnswerState[] = ["ANSWERED", "NOT_SURE", "COMPLETE_LATER"];
  if (def.allowNA) options.push("NOT_APPLICABLE");
  const unresolved = state === "NOT_SURE" || state === "COMPLETE_LATER";
  const needsNote = unresolved || state === "NOT_APPLICABLE";
  const noteLabel =
    state === "NOT_APPLICABLE"
      ? "Why is this not applicable? (required)"
      : "What do you need help with, or what question do you have for the reviewer? (optional)";
  return (
    <div className="mt-2 max-w-prose2">
      <div className="flex flex-wrap items-center gap-3">
        {current !== "ANSWERED" ? (
          <span className={unresolved ? "chip-warn" : "chip-neutral"}>
            {STATE_LABEL[current]}
            {unresolved ? " — unresolved, not “No”" : ""}
          </span>
        ) : null}
        {!disabled ? (
          <details className="text-sm">
            <summary className="w-fit cursor-pointer text-brand-700">Answer options</summary>
            <fieldset className="mt-1 space-y-1 rounded-md border border-slate-200 bg-white p-2">
              <legend className="sr-only">Answer options for {def.label}</legend>
              {options.map((o) => (
                <label key={o} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${uid}-st`}
                    className="h-4 w-4"
                    checked={current === o}
                    onChange={() => {
                      if (o === "ANSWERED") {
                        store.edit(def.id, recordId, { state: isEmptyValue(def, f?.value) ? "UNANSWERED" : "ANSWERED" });
                      } else {
                        store.edit(def.id, recordId, { state: o });
                      }
                    }}
                  />
                  {STATE_LABEL[o]}
                </label>
              ))}
            </fieldset>
          </details>
        ) : null}
      </div>
      {needsNote ? (
        <div className="mt-2">
          <label htmlFor={`${uid}-note`} className="text-sm font-medium">
            {noteLabel}
          </label>
          <AutoTextarea
            id={`${uid}-note`}
            value={f?.rationale ?? ""}
            disabled={disabled}
            rows={2}
            onChange={(v) => store.edit(def.id, recordId, { rationale: v }, false)}
          />
        </div>
      ) : null}
    </div>
  );
}

function FieldMeta({ f }: { f: FieldState | undefined }) {
  const { store } = useStoreCtx();
  if (!f) return null;
  return (
    <div className="mt-1 text-xs text-ink-soft" aria-live="polite">
      {f.status === "failed" || f.status === "rejected" || f.status === "conflict" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip-bad">
            {f.status === "failed" ? "Not saved" : f.status === "rejected" ? "Not saved — needs attention" : "Conflict — choose below"}
          </span>
          {f.status === "failed" ? (
            <button type="button" className="btn-link" onClick={() => void store.flush()}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ConflictPanel({ def, f, recordId }: { def: FieldDef; f: FieldState; recordId: string }) {
  const { store } = useStoreCtx();
  const fmt = useFormat();
  const textual = def.type === "text" || def.type === "longtext" || def.type === "link";
  const [merged, setMerged] = useState<string | null>(null);
  const saved = f.conflictSaved;
  return (
    <div role="alert" className="mt-3 max-w-prose2 rounded-md border-2 border-red-700 bg-red-50 p-3 text-sm">
      <p className="font-semibold text-red-900">Someone saved a different answer while you were editing.</p>
      <p className="mt-1">
        <strong>Saved answer</strong>
        {saved ? ` (by ${saved.editorName}, ${formatTime(saved.lastEditedAt)})` : ""}:
      </p>
      <p className="mt-1 whitespace-pre-wrap rounded border border-slate-300 bg-white p-2">
        {saved ? fmt(def, saved.value) : "(this answer was removed)"}
      </p>
      <p className="mt-2">
        <strong>Your answer</strong> (not saved yet):
      </p>
      <p className="mt-1 whitespace-pre-wrap rounded border border-slate-300 bg-white p-2">{fmt(def, f.value)}</p>
      {merged !== null ? (
        <div className="mt-2">
          <label className="font-medium" htmlFor={`m-${def.id}-${recordId}`}>
            Combine them here
          </label>
          <AutoTextarea id={`m-${def.id}-${recordId}`} value={merged} onChange={setMerged} />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => store.keepSaved(def.id, recordId)}>
          Keep saved
        </button>
        <button type="button" className="btn-primary" onClick={() => store.useMine(def.id, recordId)}>
          Use mine
        </button>
        {textual && merged === null ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setMerged(`${saved ? String(saved.value ?? "") : ""}\n${String(f.value ?? "")}`.trim())}
          >
            Edit merged
          </button>
        ) : null}
        {merged !== null ? (
          <button type="button" className="btn-primary" onClick={() => store.useMine(def.id, recordId, merged)}>
            Save merged answer
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Whichever you choose is checked again against the latest saved answer before it is stored.
      </p>
    </div>
  );
}

function QuantityControl({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const q = (value ?? {}) as { min?: number; max?: number };
  const [range, setRange] = useState(typeof q.min === "number" && typeof q.max === "number" && q.min !== q.max);
  const parse = (s: string): number | null => (s === "" ? null : Math.max(0, Math.floor(Number(s))));
  const emit = (min: number | null, max: number | null) => {
    if (min === null) return onChange(null);
    onChange({ min, max: range && max !== null ? max : min });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={id} className="text-sm text-ink-soft">
            {range ? "From (approximate)" : "Approximate number"}
          </label>
          <input
            id={id}
            type="number"
            min={0}
            className="input w-44"
            disabled={disabled}
            value={typeof q.min === "number" ? q.min : ""}
            onChange={(e) => emit(parse(e.target.value), typeof q.max === "number" ? q.max : null)}
          />
        </div>
        {range ? (
          <div>
            <label htmlFor={`${id}-max`} className="text-sm text-ink-soft">
              To
            </label>
            <input
              id={`${id}-max`}
              type="number"
              min={0}
              className="input w-44"
              disabled={disabled}
              value={typeof q.max === "number" ? q.max : ""}
              onChange={(e) => emit(typeof q.min === "number" ? q.min : null, parse(e.target.value))}
            />
          </div>
        ) : null}
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={range}
          disabled={disabled}
          onChange={(e) => {
            setRange(e.target.checked);
            if (!e.target.checked && typeof q.min === "number") onChange({ min: q.min, max: q.min });
          }}
        />
        I can only give a range
      </label>
    </div>
  );
}

function PersonControl({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const { page } = useStoreCtx();
  const v = (value ?? {}) as { userId?: string; text?: string };
  const [other, setOther] = useState(Boolean(v.text));
  const selectValue = other ? "__other" : (v.userId ?? "");
  return (
    <div className="space-y-2">
      <select
        id={id}
        className="input"
        disabled={disabled}
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === "__other") {
            setOther(true);
            onChange(null);
          } else {
            setOther(false);
            onChange(e.target.value ? { userId: e.target.value } : null);
          }
        }}
      >
        <option value="">Choose a person…</option>
        {page.people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.role}
          </option>
        ))}
        <option value="__other">Other / role (free text)</option>
      </select>
      {other ? (
        <>
          <input
            className="input"
            type="text"
            aria-label="Role or person (free text)"
            placeholder="Role or person"
            disabled={disabled}
            value={v.text ?? ""}
            onChange={(e) => onChange(e.target.value ? { text: e.target.value } : null)}
          />
          <p className="help-text">
            A free-text person receives no notifications; the assessment owner is notified about this item instead.
          </p>
        </>
      ) : null}
      <p className="help-text">
        Only people who already have access are listed. Naming someone here does not give them access.
      </p>
    </div>
  );
}

function ComputedField({ def, recordId, evalCtx }: { def: FieldDef; recordId: string; evalCtx: EvalCtx }) {
  const { page } = useStoreCtx();
  let content: ReactNode = null;
  const num = (id: string) => evalCtx.get(id, recordId)?.value;
  if (def.computed === "owner") content = <span>{page.assessment.ownerName}</span>;
  else if (def.computed === "displayId") content = <span>{page.assessment.displayId}</span>;
  else {
    const [p, i] =
      def.computed === "inherentScore"
        ? [num("J.risk.inh.p"), num("J.risk.inh.i")]
        : def.computed === "residualScore"
          ? [num("J.risk.res.p"), num("J.risk.res.i")]
          : [num("J.risk.target.p"), num("J.risk.target.i")];
    const cat = riskCategory(riskScore(p, i));
    content = (
      <span className="inline-flex items-center gap-2">
        <strong>{describeRisk(p, i)}</strong>
        {cat ? <span className={cat === "HIGH" ? "chip-bad" : cat === "MEDIUM" ? "chip-warn" : "chip-good"}>{cat}</span> : null}
      </span>
    );
  }
  return (
    <div>
      <p className="label">{def.label}</p>
      <p className="mt-1" aria-live="polite">
        {content}
      </p>
      {def.workflowNote ? <p className="help-text mt-1">{def.workflowNote}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ shared entities

function EntityPicker({
  def,
  recordId,
  disabled,
  multiple,
}: {
  def: FieldDef;
  recordId: string;
  disabled: boolean;
  multiple: boolean;
}) {
  const { store } = useStoreCtx();
  useStoreRev(store);
  const kind = def.entityKind!;
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = store.get(def.id, recordId);
  const value = f?.value;
  const selected: string[] = multiple
    ? Array.isArray(value)
      ? (value as string[])
      : []
    : typeof value === "string" && value
      ? [value]
      : [];
  const all = store.entities.filter((e) => e.kind === kind);
  const unselected = all.filter((e) => !selected.includes(e.id));
  const suggestions = (kind === "PARTY" ? SUGGESTED_PARTIES : kind === "DATA_SUBJECT" ? SUGGESTED_DATA_SUBJECTS : SUGGESTED_DATA_CATEGORIES).filter(
    (s) => !all.some((e) => e.name.toLowerCase() === s.toLowerCase()),
  );

  const choose = (id: string) => {
    if (multiple) store.edit(def.id, recordId, { value: selected.includes(id) ? selected : [...selected, id] });
    else store.edit(def.id, recordId, { value: id });
  };
  const drop = (id: string) => {
    if (multiple) store.edit(def.id, recordId, { value: selected.filter((x) => x !== id) });
    else store.edit(def.id, recordId, { value: "" });
  };
  const addByName = async (name: string) => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setMsg(null);
    const res = await store.createEntity(kind, n);
    setBusy(false);
    if (res.error || !res.entity) {
      setMsg(res.error ?? "Could not add the entry.");
      return;
    }
    choose(res.entity.id);
    setDraft("");
  };

  const vague = kind === "DATA_CATEGORY" && isVagueCategory(draft);
  const chosenVague = kind === "DATA_CATEGORY" ? selected.filter((id) => isVagueCategory(all.find((e) => e.id === id)?.name ?? "")) : [];

  return (
    <div className="space-y-2">
      {selected.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Selected entries">
          {selected.map((id) => (
            <li key={id} className="chip-good gap-1.5 !text-sm">
              {store.entities.find((e) => e.id === id)?.name ?? "(removed entry)"}
              {!disabled ? (
                <button
                  type="button"
                  className="rounded px-1 font-semibold underline"
                  onClick={() => drop(id)}
                  aria-label={`Remove ${store.entities.find((e) => e.id === id)?.name ?? "entry"}`}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="help-text">Nothing selected yet.</p>
      )}
      {chosenVague.length ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
          <strong>Check:</strong> {VAGUE_CATEGORY_HINT}
        </p>
      ) : null}
      {!disabled ? (
        <>
          {unselected.length ? (
            <div>
              <p className="text-sm font-medium">Choose an existing entry</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {unselected.map((e) => (
                  <button key={e.id} type="button" className="btn-secondary !px-2.5 !py-1" onClick={() => choose(e.id)}>
                    {e.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {suggestions.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-brand-700">Suggestions (fictional, not pre-selected)</summary>
              <div className="mt-1 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="btn-secondary !px-2.5 !py-1" disabled={busy} onClick={() => void addByName(s)}>
                    Add “{s}”
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          <div>
            <label className="text-sm font-medium" htmlFor={`${def.id}-${recordId}-new`}>
              Add a new entry
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={`${def.id}-${recordId}-new`}
                className="input"
                type="text"
                value={draft}
                maxLength={120}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addByName(draft);
                  }
                }}
              />
              <button type="button" className="btn-secondary shrink-0" disabled={busy || !draft.trim()} onClick={() => void addByName(draft)}>
                Add
              </button>
            </div>
            {vague ? (
              <p className="mt-1 text-sm text-amber-900">
                <strong>Check:</strong> {VAGUE_CATEGORY_HINT}
              </p>
            ) : null}
            {msg ? (
              <p role="alert" className="mt-1 text-sm font-medium text-red-800">
                {msg}
              </p>
            ) : null}
          </div>
          <EntityManager kind={kind} />
        </>
      ) : null}
    </div>
  );
}

function EntityManager({ kind }: { kind: "PARTY" | "DATA_SUBJECT" | "DATA_CATEGORY" }) {
  const { store, page } = useStoreCtx();
  useStoreRev(store);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [refs, setRefs] = useState<{ id: string; list: { label: string; subsectionId: string }[] } | null>(null);
  const all = store.entities.filter((e) => e.kind === kind);
  if (all.length === 0) return null;
  const isOwner = page.actor.id === page.assessment.ownerId;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-brand-700">Rename or delete shared entries</summary>
      <p className="help-text mt-1">
        These entries are shared across the assessment. Renaming changes every place where the entry is used.
      </p>
      <ul className="mt-2 space-y-2">
        {all.map((e) => (
          <li key={e.id} className="rounded border border-slate-200 bg-white p-2">
            {editing === e.id ? (
              <div className="flex gap-2">
                <input className="input" aria-label={`New name for ${e.name}`} value={name} maxLength={120} onChange={(ev) => setName(ev.target.value)} />
                <button
                  type="button"
                  className="btn-primary shrink-0"
                  onClick={async () => {
                    const err = await store.renameEntity(e.id, name);
                    setMsg(err);
                    if (!err) setEditing(null);
                  }}
                >
                  Save name
                </button>
                <button type="button" className="btn-secondary shrink-0" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.name}</span>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    setEditing(e.id);
                    setName(e.name);
                    setMsg(null);
                  }}
                >
                  Rename
                </button>
                {isOwner ? (
                  <button
                    type="button"
                    className="btn-link text-red-800"
                    onClick={async () => {
                      const res = await store.deleteEntity(e.id, false);
                      if (res.references) setRefs({ id: e.id, list: res.references });
                      else if (res.error) setMsg(res.error);
                      else window.location.reload();
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            )}
            {refs?.id === e.id ? (
              <div className="mt-2 rounded border border-amber-400 bg-amber-50 p-2">
                <p className="font-medium">“{e.name}” is still used in:</p>
                <ul className="list-disc pl-5">
                  {[...new Set(refs.list.map((r) => `${r.label} (section ${r.subsectionId})`))].map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={async () => {
                      const res = await store.deleteEntity(e.id, true);
                      if (res.error) setMsg(res.error);
                      else window.location.reload();
                    }}
                  >
                    Remove it from those answers and delete it
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setRefs(null)}>
                    Keep it
                  </button>
                </div>
              </div>
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
