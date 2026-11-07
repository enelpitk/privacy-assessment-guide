"use client";

import { useState } from "react";
import type { ThreadView } from "@/lib/govTypes";
import { useStoreCtx } from "./context";
import { formatTime } from "./Fields";
import { postAction, useCollab } from "./collab";

function Thread({ t, subsectionId }: { t: ThreadView; subsectionId: string }) {
  const { page } = useStoreCtx();
  const { can, reloadThreads } = useCollab();
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    const r = await postAction(page.assessment.id, body);
    setBusy(false);
    if (!r.ok) return setMsg(r.data.error ?? "That did not work.");
    setReply("");
    await reloadThreads();
  };
  const allowed = can("addComment") && page.ctx.lifecycle !== "ARCHIVED";
  return (
    <li className={`rounded border p-2 ${t.state === "RESOLVED" ? "border-slate-200 bg-slate-50" : "border-sky-300 bg-white"}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className={t.state === "RESOLVED" ? "chip-neutral" : "chip-warn"}>{t.state === "RESOLVED" ? "Resolved" : "Open"}</span>
        {allowed ? (
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            onClick={() => void act({ action: t.state === "RESOLVED" ? "reopenThread" : "resolveThread", threadId: t.id })}
          >
            {t.state === "RESOLVED" ? "Reopen" : "Resolve"}
          </button>
        ) : null}
      </div>
      <ul className="space-y-1.5">
        {t.comments.map((c) => (
          <li key={c.id} className={c.parentId ? "ml-4 border-l-2 border-slate-200 pl-2" : ""}>
            <p className="text-xs text-ink-soft">
              {c.authorName}
              {c.isReview ? " (DPO review comment)" : ""} · {formatTime(c.createdAt)}
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
      {allowed ? (
        <div className="mt-2 flex gap-2">
          <label className="sr-only" htmlFor={`reply-${t.id}`}>
            Reply
          </label>
          <input id={`reply-${t.id}`} className="input" placeholder="Reply" value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} />
          <button
            type="button"
            className="btn-secondary shrink-0"
            disabled={busy || !reply.trim()}
            onClick={() =>
              void act({ action: "addComment", subsectionId, fieldId: t.fieldId ?? undefined, recordId: t.recordId ?? undefined, threadId: t.id, parentId: t.comments[t.comments.length - 1]?.id, body: reply })
            }
          >
            Reply
          </button>
        </div>
      ) : null}
      {msg ? (
        <p role="alert" className="mt-1 text-sm font-medium text-red-800">
          {msg}
        </p>
      ) : null}
    </li>
  );
}

function Panel({ subsectionId, fieldId, recordId, label }: { subsectionId: string; fieldId?: string; recordId?: string; label: string }) {
  const { page } = useStoreCtx();
  const { threads, can, reloadThreads } = useCollab();
  const mine = threads.filter((t) => t.subsectionId === subsectionId && (t.fieldId ?? undefined) === fieldId && (t.recordId ?? undefined) === (recordId || undefined));
  const open = mine.filter((t) => t.state === "OPEN").length;
  const [show, setShow] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = can("addComment") && page.ctx.lifecycle !== "ARCHIVED";
  if (!allowed && mine.length === 0) return null;
  return (
    <div className="mt-1 max-w-prose2 text-sm">
      <button type="button" className="btn-link" aria-expanded={show} onClick={() => setShow((v) => !v)}>
        {mine.length ? `${label} (${mine.length}${open ? `, ${open} open` : ""})` : label}
      </button>
      {show ? (
        <div className="mt-1 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          {mine.length ? (
            <ul className="space-y-2">
              {mine.map((t) => (
                <Thread key={t.id} t={t} subsectionId={subsectionId} />
              ))}
            </ul>
          ) : (
            <p className="help-text">No comments yet.</p>
          )}
          {allowed ? (
            <div>
              <label className="font-medium" htmlFor={`new-${subsectionId}-${fieldId ?? "s"}-${recordId ?? ""}`}>
                New comment
              </label>
              <textarea
                id={`new-${subsectionId}-${fieldId ?? "s"}-${recordId ?? ""}`}
                className="input mt-1"
                rows={2}
                value={text}
                maxLength={4000}
                onChange={(e) => setText(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary mt-1"
                disabled={busy || !text.trim()}
                onClick={async () => {
                  setBusy(true);
                  setMsg(null);
                  const r = await postAction(page.assessment.id, { action: "addComment", subsectionId, fieldId, recordId, body: text });
                  setBusy(false);
                  if (!r.ok) return setMsg(r.data.error ?? "That did not work.");
                  setText("");
                  await reloadThreads();
                }}
              >
                Add comment
              </button>
              {msg ? (
                <p role="alert" className="mt-1 font-medium text-red-800">
                  {msg}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Question-level comments. Comments stay available while the assessment is locked for review. */
export function FieldComments({ subsectionId, fieldId, recordId }: { subsectionId: string; fieldId: string; recordId: string }) {
  return <Panel subsectionId={subsectionId} fieldId={fieldId} recordId={recordId || undefined} label="Comment" />;
}

/** Section-level comments (not tied to one question). */
export function SectionComments({ subsectionId }: { subsectionId: string }) {
  return <Panel subsectionId={subsectionId} label="Comments on this section" />;
}
