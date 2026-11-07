"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { STAGES, subsectionById } from "@/content";
import { buildModel, evaluateAssessment, evaluateSubsection, stageProgress } from "@/domain/model";
import { LIFECYCLE_LABEL, SCREENING_LABEL } from "@/lib/labels";
import type { PageData } from "@/lib/types";
import { StoreCtx, useStoreCtx, useStoreRev } from "./context";
import { AssessmentStore } from "./store";
import { useModel } from "./SubsectionForm";

const FLASH_KEY = "dpia-flash";

export function Shell({ page, current, children }: { page: PageData; current: string | null; children: ReactNode }) {
  const router = useRouter();
  const [store] = useState(() => new AssessmentStore(page));

  const navigate = useMemo(
    () => async (href: string) => {
      const ok = await store.flush();
      if (!ok && !window.confirm("Some changes could not be saved yet. If you leave now they will be lost. Leave anyway?")) return;
      if (current) {
        const sub = subsectionById.get(current);
        if (sub) {
          // Show open items on navigation, without blocking it.
          const rows = store.records.map((r) => ({ id: r.id, collection: r.collection, parentId: r.parentId, ordering: r.ordering }));
          const res = evaluateSubsection(sub, buildModel(store.responses(), rows));
          if (res.active && res.gaps.length > 0) {
            try {
              sessionStorage.setItem(
                FLASH_KEY,
                `${sub.id} ${sub.title}: ${res.gaps.length} item${res.gaps.length === 1 ? " is" : "s are"} still open${res.unresolved ? ` (${res.unresolved} marked not sure or complete later)` : ""}. You can come back any time.`,
              );
            } catch {
              /* sessionStorage unavailable: skip the notice */
            }
          }
        }
      }
      router.push(href);
    },
    [store, current, router],
  );

  // Warn before leaving the page while edits are unsaved.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (store.hasUnsaved()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [store]);

  // Remember the last location on the server (not in the browser).
  useEffect(() => {
    if (!current) return;
    void fetch(`/api/assessments/${page.assessment.id}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subsectionId: current }),
    }).catch(() => undefined);
  }, [current, page.assessment.id]);

  const panel = useNavPanel();
  return (
    <StoreCtx.Provider value={{ store, page, navigate }}>
      <AssessmentHeader />
      <NavToggle open={panel.open} toggle={panel.toggle} />
      <div className="fixed bottom-3 right-3 z-40 rounded-full border border-slate-300 bg-white px-3 py-1.5 shadow-md">
        <SaveIndicator />
      </div>
      <div className={`mx-auto grid max-w-[88rem] gap-6 px-4 py-5 ${panel.columns}`}>
        <SideNav current={current} visibility={panel.visibility} />
        <main id="main" className="min-w-0">
          <Flash />
          {children}
        </main>
      </div>
    </StoreCtx.Provider>
  );
}

function Flash() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(FLASH_KEY);
      if (m) {
        setMsg(m);
        sessionStorage.removeItem(FLASH_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);
  if (!msg) return null;
  return (
    <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm">
      <span>{msg}</span>
      <button type="button" className="btn-link shrink-0" onClick={() => setMsg(null)}>
        Dismiss
      </button>
    </div>
  );
}

function SaveIndicator() {
  const { store } = useStoreCtx();
  useStoreRev(store);
  const s = store.summary();
  let text = "No unsaved changes";
  let cls = "chip-neutral";
  if (s.conflicts > 0) {
    text = "Conflict — resolve it beside the answer";
    cls = "chip-bad";
  } else if (s.failed > 0 || s.rejected > 0) {
    text = "Save failed";
    cls = "chip-bad";
  } else if (s.saving > 0) {
    text = "Saving…";
  } else if (s.dirty > 0) {
    text = "Unsaved changes";
    cls = "chip-warn";
  } else if (store.lastSavedAt) {
    text = `Saved at ${store.lastSavedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`; // client-only value, set after a save
    cls = "chip-good";
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
      <span className={cls}>{text}</span>
      {s.failed > 0 || s.rejected > 0 ? (
        <button type="button" className="btn-secondary !px-2.5 !py-1" onClick={() => void store.flush()}>
          Retry
        </button>
      ) : null}
      {s.failed > 0 && store.lastError ? <span className="text-xs text-red-900">{store.lastError}</span> : null}
    </div>
  );
}

function AssessmentHeader() {
  const { page } = useStoreCtx();
  const a = page.assessment;
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[88rem] flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-soft">
            <Link className="btn-link" href="/assessments">
              All assessments
            </Link>{" "}
            · {a.displayId} · {a.department} ({a.groupEntity})
          </p>
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{a.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="chip-neutral">{LIFECYCLE_LABEL[a.lifecycle] ?? a.lifecycle}</span>
            <span className="chip-neutral">{SCREENING_LABEL[a.screeningStatus] ?? a.screeningStatus}</span>
            <span className="chip-neutral">Version {a.versionNumber}</span>
            <span className="text-ink-soft">Owner: {a.ownerName}</span>
            <span className="text-ink-soft">DPO: {a.dpoName}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function SideNav({ current, visibility }: { current: string | null; visibility: string }) {
  const { page, navigate } = useStoreCtx();
  const model = useModel();
  const result = evaluateAssessment(model);
  const progress = stageProgress(result);
  const content = (
    <nav aria-label="Assessment sections" className="text-sm">
      <p className="mb-2">
        <Link
          href={`/assessments/${page.assessment.id}`}
          className="btn-link"
          onClick={(e) => {
            e.preventDefault();
            void navigate(`/assessments/${page.assessment.id}`);
          }}
        >
          Overview and progress
        </Link>
      </p>
      <ol className="space-y-3">
        {STAGES.map((st) => {
          const p = progress.find((x) => x.id === st.id)!;
          return (
            <li key={st.id}>
              <p className="font-semibold">
                {st.id}. {st.title}{" "}
                <span className="font-normal text-ink-soft">
                  ({p.complete}/{p.required})
                </span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {st.subsections.map((s) => {
                  const r = result.subsections[s.id];
                  const href = `/assessments/${page.assessment.id}/s/${s.id}`;
                  const isCurrent = s.id === current;
                  return (
                    <li key={s.id}>
                      <a
                        href={href}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-100 ${isCurrent ? "bg-brand-50 font-semibold text-brand-800" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          void navigate(href);
                        }}
                      >
                        <span>
                          {s.id} {s.title}
                        </span>
                        <span className="shrink-0 text-xs text-ink-soft">
                          {!r.active
                            ? "n/a"
                            : r.required === 0
                              ? "—"
                              : r.gaps.length === 0
                                ? "Done"
                                : `${r.gaps.length} open`}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </nav>
  );
  // Always mounted; visibility is controlled by the wrapper so toggling never loses state.
  return (
    <div id="assessment-nav" className={`${visibility} rounded-md border border-slate-200 bg-white p-3 lg:border-0 lg:bg-transparent lg:p-0`}>
      {content}
    </div>
  );
}

// ---- navigation panel preference (a UI preference only, never assessment data)
const NAV_PREF_KEY = "dpia-nav-pref";
type NavPref = "open" | "closed" | null;

const subscribeDesktop = (fn: () => void) => {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};

function useNavPanel() {
  const [pref, setPref] = useState<NavPref>(null);
  // Server snapshot assumes desktop; CSS defaults (below) cover the first paint on both sizes.
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
  useEffect(() => {
    try {
      const v = localStorage.getItem(NAV_PREF_KEY);
      if (v === "open" || v === "closed") setPref(v);
    } catch {
      /* preference unavailable: use the defaults */
    }
  }, []);
  const open = pref ? pref === "open" : isDesktop;
  const toggle = () => {
    const next: NavPref = open ? "closed" : "open";
    setPref(next);
    try {
      localStorage.setItem(NAV_PREF_KEY, next ?? "");
    } catch {
      /* ignore */
    }
  };
  // Until a choice is made: shown on desktop, hidden on mobile (pure CSS, no flash).
  const visibility = pref === "open" ? "block" : pref === "closed" ? "hidden" : "hidden lg:block";
  const columns = pref === "closed" ? "" : "lg:grid-cols-[17rem_minmax(0,1fr)]";
  return { open, toggle, visibility, columns };
}

export function NavToggle({ open, toggle }: { open: boolean; toggle: () => void }) {
  return (
    <div className="mx-auto max-w-[88rem] px-4 pt-3">
      <button
        type="button"
        className="btn-secondary"
        aria-expanded={open}
        aria-controls="assessment-nav"
        onClick={toggle}
        suppressHydrationWarning
      >
        {open ? "Hide navigation" : "Show navigation"}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ overview

export function Overview() {
  const { page, navigate } = useStoreCtx();
  const model = useModel();
  const result = evaluateAssessment(model);
  const progress = stageProgress(result);
  const resume = page.lastSubsection && subsectionById.has(page.lastSubsection) ? page.lastSubsection : null;
  const go = (id: string) => `/assessments/${page.assessment.id}/s/${id}`;
  return (
    <div className="max-w-prose2 space-y-6">
      <section className="card">
        <h2 className="text-xl font-semibold">Where you are</h2>
        <p className="mt-2">
          <strong>{result.percent}%</strong> of the applicable answers are completed ({result.complete} of {result.required}). This measures how much has been filled in, not
          whether the processing complies with the GDPR.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            className="btn-primary"
            href={go("C0")}
            onClick={(e) => {
              e.preventDefault();
              void navigate(go("C0"));
            }}
          >
            Start with the pre-assessment (C)
          </a>
          {resume ? (
            <a
              className="btn-secondary"
              href={go(resume)}
              onClick={(e) => {
                e.preventDefault();
                void navigate(go(resume));
              }}
            >
              Resume last location: {resume} {subsectionById.get(resume)?.title}
            </a>
          ) : null}
        </div>
        <p className="help-text mt-3">
          Every assessment starts with the pre-assessment. Answers are saved to the server as you work, and you can leave and return at any time.
        </p>
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold">Progress by stage</h2>
        <ul className="mt-2 divide-y divide-slate-200">
          {STAGES.map((st) => {
            const p = progress.find((x) => x.id === st.id)!;
            const first = st.subsections[0].id;
            return (
              <li key={st.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <a
                    href={go(first)}
                    className="btn-link"
                    onClick={(e) => {
                      e.preventDefault();
                      void navigate(go(first));
                    }}
                  >
                    {st.id}. {st.title}
                  </a>
                  <span className="help-text block">{st.description}</span>
                </span>
                <span className="shrink-0 text-sm">
                  {p.required === 0 ? "Not applicable yet" : `${p.complete} of ${p.required}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold">Not available yet</h2>
        <p className="help-text mt-1">These parts of the guide are built in later stages. Nothing on this page implies they work today.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Suggested screening answers and automatic screening outcomes, and the risk matrix with your own risks (Stage 3).</li>
          <li>Assignments, comments, submission for review, the DPO’s decisions, the owner’s decision, conditions, revisions and archiving (Stage 4).</li>
          <li>Notifications, the printable report, JSON export, the demo guide, the glossary and the wording demonstration (Stage 5).</li>
        </ul>
      </section>
    </div>
  );
}
