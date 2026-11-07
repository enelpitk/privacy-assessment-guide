import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { changeClassOf, fieldIndex } from "@/content";
import { canEditField } from "@/domain/permissions";
import { decideRevision } from "@/domain/concurrency";
import { validateValue } from "@/domain/validation";
import { loadAccessible } from "./access";

const STATES = ["ANSWERED", "UNANSWERED", "NOT_APPLICABLE", "NOT_SURE", "COMPLETE_LATER"] as const;
type State = (typeof STATES)[number];

export interface ChangeIn {
  fieldId: string;
  recordId: string;
  baseRevision: number;
  value?: unknown;
  state: State;
  rationale?: string | null;
}

export interface SavedValue {
  value: unknown;
  state: State;
  rationale: string | null;
  revision: number;
  editorName: string;
  lastEditedAt: string;
}

export type ChangeOut =
  | { fieldId: string; recordId: string; status: "saved"; saved: SavedValue }
  | { fieldId: string; recordId: string; status: "conflict"; saved: SavedValue | null }
  | { fieldId: string; recordId: string; status: "rejected"; reason: string };

const json = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === undefined || v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

/**
 * Saves each change independently and atomically: the revision check and the write are a single
 * conditional statement in the database, so a concurrent writer can never be silently overwritten.
 * Permissions, assignments and workflow locks are re-checked on every call.
 */
export async function saveChanges(
  user: CurrentUser,
  assessmentId: string,
  changes: ChangeIn[],
): Promise<ChangeOut[]> {
  const { assessment, ctx, versionId } = await loadAccessible(user, assessmentId);
  const recordIds = [...new Set(changes.map((c) => c.recordId).filter(Boolean))];
  const records = recordIds.length
    ? await prisma.recordItem.findMany({ where: { id: { in: recordIds }, versionId, deletedAt: null } })
    : [];
  const recordById = new Map(records.map((r) => [r.id, r]));
  const out: ChangeOut[] = [];
  let anySaved = false;

  const loadSaved = async (fieldId: string, recordId: string): Promise<SavedValue | null> => {
    const row = await prisma.responseField.findUnique({
      where: { versionId_fieldId_recordId: { versionId, fieldId, recordId } },
    });
    if (!row) return null;
    const editor = await prisma.user.findUnique({ where: { id: row.lastEditorId } });
    return {
      value: row.value,
      state: row.state as State,
      rationale: row.rationale,
      revision: row.revision,
      editorName: editor?.displayName ?? "Unknown user",
      lastEditedAt: row.lastEditedAt.toISOString(),
    };
  };

  for (const ch of changes) {
    const base = { fieldId: ch.fieldId, recordId: ch.recordId };
    const reject = (reason: string): ChangeOut => ({ ...base, status: "rejected", reason });
    const loc = fieldIndex.get(ch.fieldId);
    if (!loc) {
      out.push(reject("Unknown field."));
      continue;
    }
    const def = loc.def;

    const innermost = loc.collections[loc.collections.length - 1];
    if (innermost) {
      const rec = recordById.get(ch.recordId);
      if (!ch.recordId || !rec || rec.collection !== innermost) {
        out.push(reject("This entry no longer exists. Reload to see the current list."));
        continue;
      }
    } else if (ch.recordId !== "") {
      out.push(reject("Invalid record."));
      continue;
    }

    const perm = canEditField(
      user,
      ctx,
      { id: def.id, changeClass: changeClassOf(def), workflow: def.workflow, computed: def.type === "computed" },
      loc.subsectionId,
    );
    if (!perm.ok) {
      out.push(reject(perm.reason));
      continue;
    }

    if (!STATES.includes(ch.state)) {
      out.push(reject("Invalid answer state."));
      continue;
    }
    if (ch.state === "NOT_APPLICABLE" && !def.allowNA) {
      out.push(reject("“Not applicable” is not available for this question."));
      continue;
    }
    if (ch.state === "NOT_SURE" && def.allowNotSure === false) {
      out.push(reject("“Not sure” is not available for this question."));
      continue;
    }
    const err = validateValue(def, ch.value);
    if (err) {
      out.push(reject(err));
      continue;
    }
    const rationale = typeof ch.rationale === "string" ? ch.rationale.slice(0, 5000) : null;
    const now = new Date();
    const existing = await prisma.responseField.findUnique({
      where: { versionId_fieldId_recordId: { versionId, fieldId: ch.fieldId, recordId: ch.recordId } },
    });

    if (decideRevision(ch.baseRevision, existing?.revision) === "conflict") {
      out.push({ ...base, status: "conflict", saved: await loadSaved(ch.fieldId, ch.recordId) });
      continue;
    }

    let wrote = false;
    if (existing) {
      const res = await prisma.responseField.updateMany({
        where: { id: existing.id, revision: existing.revision },
        data: {
          value: json(ch.value),
          state: ch.state,
          rationale,
          revision: { increment: 1 },
          lastEditorId: user.id,
          lastEditedAt: now,
        },
      });
      wrote = res.count === 1;
    } else {
      const res = await prisma.responseField.createMany({
        data: [
          {
            versionId,
            fieldId: ch.fieldId,
            recordId: ch.recordId,
            value: ch.value === undefined || ch.value === null ? Prisma.DbNull : (ch.value as Prisma.InputJsonValue),
            state: ch.state,
            rationale,
            revision: 1,
            lastEditorId: user.id,
            lastEditedAt: now,
          },
        ],
        skipDuplicates: true,
      });
      wrote = res.count === 1;
    }

    if (!wrote) {
      out.push({ ...base, status: "conflict", saved: await loadSaved(ch.fieldId, ch.recordId) });
      continue;
    }

    anySaved = true;
    const saved = await loadSaved(ch.fieldId, ch.recordId);
    out.push({ ...base, status: "saved", saved: saved! });

    // Denormalised columns used by the register.
    if (ch.fieldId === "A.processingName" && typeof ch.value === "string" && ch.value.trim()) {
      await prisma.assessment.update({ where: { id: assessment.id }, data: { name: ch.value.trim().slice(0, 200) } });
    }
    if (ch.fieldId === "K.review.interval" || ch.fieldId === "K.review.periodic" || ch.fieldId === "K.review.noSchedule") {
      await syncNextReview(assessment.id, versionId);
      await prisma.event.create({
        data: { assessmentId: assessment.id, versionId, actorId: user.id, type: "REVIEW_DATE_CHANGED", payload: { fieldId: ch.fieldId } },
      });
    }
  }

  if (anySaved) {
    await prisma.assessment.update({ where: { id: assessment.id }, data: { updatedAt: new Date() } });
  }
  return out;
}

async function syncNextReview(assessmentId: string, versionId: string) {
  const rows = await prisma.responseField.findMany({
    where: { versionId, fieldId: { in: ["K.review.interval", "K.review.periodic"] }, recordId: "" },
  });
  const periodic = rows.find((r) => r.fieldId === "K.review.periodic")?.value;
  const interval = rows.find((r) => r.fieldId === "K.review.interval");
  let next: Date | null = null;
  if (periodic === "YES" && interval?.state === "ANSWERED" && typeof interval.value === "string") {
    const d = new Date(`${interval.value}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) next = d;
  }
  await prisma.assessment.update({ where: { id: assessmentId }, data: { nextReviewDate: next } });
}
