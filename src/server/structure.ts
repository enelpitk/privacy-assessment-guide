import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/session";
import { collectionIndex, fieldIndex } from "@/content";
import { canChangeRecords, canManageEntity } from "@/domain/permissions";
import { loadAccessible } from "./access";

// ------------------------------------------------------------ records

export async function createRecord(
  user: CurrentUser,
  assessmentId: string,
  collectionId: string,
  parentId: string | null,
) {
  const { ctx, versionId } = await loadAccessible(user, assessmentId);
  const loc = collectionIndex.get(collectionId);
  if (!loc) throw new HttpError(400, "Unknown collection.");
  if (loc.def.workflow) throw new HttpError(403, "This list is recorded through the review workflow.");
  const perm = canChangeRecords(user, ctx, loc.subsectionId);
  if (!perm.ok) throw new HttpError(403, perm.reason);

  if (loc.parent) {
    const parent = parentId
      ? await prisma.recordItem.findFirst({ where: { id: parentId, versionId, deletedAt: null } })
      : null;
    if (!parent || parent.collection !== loc.parent) throw new HttpError(400, "Parent entry not found.");
  } else if (parentId) {
    throw new HttpError(400, "This list has no parent.");
  }

  const last = await prisma.recordItem.findFirst({
    where: { versionId, collection: collectionId, parentId: parentId ?? null },
    orderBy: { ordering: "desc" },
  });
  const rec = await prisma.recordItem.create({
    data: {
      versionId,
      collection: collectionId,
      parentId: parentId ?? null,
      ordering: (last?.ordering ?? -1) + 1,
      createdById: user.id,
    },
  });
  return { id: rec.id, collection: rec.collection, parentId: rec.parentId, ordering: rec.ordering, revision: rec.revision };
}

async function loadRecord(versionId: string, recordId: string) {
  const rec = await prisma.recordItem.findFirst({ where: { id: recordId, versionId } });
  if (!rec || rec.deletedAt) throw new HttpError(409, "This entry no longer exists. Reload to see the current list.");
  return rec;
}

/** Structural change: deletion is revision-checked and also removes nested entries from the active list. */
export async function deleteRecord(user: CurrentUser, assessmentId: string, recordId: string, baseRevision: number) {
  const { ctx, versionId } = await loadAccessible(user, assessmentId);
  const rec = await loadRecord(versionId, recordId);
  const loc = collectionIndex.get(rec.collection);
  if (!loc || loc.def.workflow) throw new HttpError(403, "This list is recorded through the review workflow.");
  const perm = canChangeRecords(user, ctx, loc.subsectionId);
  if (!perm.ok) throw new HttpError(403, perm.reason);

  const now = new Date();
  const res = await prisma.recordItem.updateMany({
    where: { id: rec.id, revision: baseRevision, deletedAt: null },
    data: { deletedAt: now, revision: { increment: 1 } },
  });
  if (res.count !== 1) {
    throw new HttpError(409, "This entry was changed by someone else. Reload and try again.");
  }
  // Nested entries leave the active list too; their answers are preserved in the database.
  const stack = [rec.id];
  while (stack.length) {
    const parent = stack.pop()!;
    const kids = await prisma.recordItem.findMany({ where: { parentId: parent, versionId, deletedAt: null } });
    for (const k of kids) {
      await prisma.recordItem.update({ where: { id: k.id }, data: { deletedAt: now } });
      stack.push(k.id);
    }
  }
}

export async function moveRecord(
  user: CurrentUser,
  assessmentId: string,
  recordId: string,
  direction: "up" | "down",
  baseRevision: number,
) {
  const { ctx, versionId } = await loadAccessible(user, assessmentId);
  const rec = await loadRecord(versionId, recordId);
  const loc = collectionIndex.get(rec.collection);
  if (!loc || loc.def.workflow) throw new HttpError(403, "This list is recorded through the review workflow.");
  const perm = canChangeRecords(user, ctx, loc.subsectionId);
  if (!perm.ok) throw new HttpError(403, perm.reason);
  if (rec.revision !== baseRevision) {
    throw new HttpError(409, "This list was changed by someone else. Reload and try again.");
  }
  const sibling = await prisma.recordItem.findFirst({
    where: {
      versionId,
      collection: rec.collection,
      parentId: rec.parentId,
      deletedAt: null,
      ordering: direction === "up" ? { lt: rec.ordering } : { gt: rec.ordering },
    },
    orderBy: { ordering: direction === "up" ? "desc" : "asc" },
  });
  if (!sibling) return;
  await prisma.$transaction(async (tx) => {
    const a = await tx.recordItem.updateMany({
      where: { id: rec.id, revision: rec.revision },
      data: { ordering: sibling.ordering, revision: { increment: 1 } },
    });
    if (a.count !== 1) throw new HttpError(409, "This list was changed by someone else. Reload and try again.");
    await tx.recordItem.update({
      where: { id: sibling.id },
      data: { ordering: rec.ordering, revision: { increment: 1 } },
    });
  });
}

// ------------------------------------------------------------ shared entities

const ENTITY_KINDS = ["PARTY", "DATA_SUBJECT", "DATA_CATEGORY"] as const;
type Kind = (typeof ENTITY_KINDS)[number];

export interface EntityRef {
  fieldId: string;
  label: string;
  recordId: string;
  subsectionId: string;
}

function containsId(value: unknown, id: string): boolean {
  return value === id || (Array.isArray(value) && value.includes(id));
}

export async function findEntityReferences(versionId: string, entityId: string) {
  const entityFields = [...fieldIndex.values()].filter(
    (l) => l.def.type === "entity" || l.def.type === "entities",
  );
  const rows = await prisma.responseField.findMany({
    where: { versionId, fieldId: { in: entityFields.map((l) => l.def.id) } },
  });
  const live = new Set(
    (await prisma.recordItem.findMany({ where: { versionId, deletedAt: null }, select: { id: true } })).map((r) => r.id),
  );
  const refs: (EntityRef & { rowId: string; revision: number; value: unknown })[] = [];
  for (const r of rows) {
    if (r.recordId !== "" && !live.has(r.recordId)) continue;
    if (!containsId(r.value, entityId)) continue;
    const loc = fieldIndex.get(r.fieldId)!;
    refs.push({
      fieldId: r.fieldId,
      label: loc.def.label,
      recordId: r.recordId,
      subsectionId: loc.subsectionId,
      rowId: r.id,
      revision: r.revision,
      value: r.value,
    });
  }
  return refs;
}

export async function createEntity(user: CurrentUser, assessmentId: string, kind: string, rawName: string) {
  const { ctx, versionId } = await loadAccessible(user, assessmentId);
  if (!ENTITY_KINDS.includes(kind as Kind)) throw new HttpError(400, "Unknown entry type.");
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 120) throw new HttpError(400, "Enter a name of 1 to 120 characters.");
  const perm = canManageEntity(user, ctx, "create", []);
  if (!perm.ok) throw new HttpError(403, perm.reason);
  const existing = await prisma.entity.findFirst({
    where: { versionId, kind: kind as Kind, deletedAt: null, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return { id: existing.id, kind: existing.kind, name: existing.name, revision: existing.revision, existed: true };
  const e = await prisma.entity.create({ data: { versionId, kind: kind as Kind, name, createdById: user.id } });
  return { id: e.id, kind: e.kind, name: e.name, revision: e.revision, existed: false };
}

export async function renameEntity(
  user: CurrentUser,
  assessmentId: string,
  entityId: string,
  rawName: string,
  baseRevision: number,
) {
  const { ctx, versionId } = await loadAccessible(user, assessmentId);
  const ent = await prisma.entity.findFirst({ where: { id: entityId, versionId, deletedAt: null } });
  if (!ent) throw new HttpError(404, "Entry not found.");
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 120) throw new HttpError(400, "Enter a name of 1 to 120 characters.");
  const refs = await findEntityReferences(versionId, entityId);
  const perm = canManageEntity(user, ctx, "rename", [...new Set(refs.map((r) => r.subsectionId))]);
  if (!perm.ok) throw new HttpError(403, perm.reason);
  const res = await prisma.entity.updateMany({
    where: { id: ent.id, revision: baseRevision },
    data: { name, revision: { increment: 1 } },
  });
  if (res.count !== 1) throw new HttpError(409, "This entry was renamed by someone else. Reload and try again.");
  return { id: ent.id, name, revision: baseRevision + 1, usedIn: [...new Set(refs.map((r) => r.subsectionId))] };
}

export async function deleteEntity(
  user: CurrentUser,
  assessmentId: string,
  entityId: string,
  baseRevision: number,
  unlink: boolean,
) {
  const { ctx, versionId } = await loadAccessible(user, assessmentId);
  const ent = await prisma.entity.findFirst({ where: { id: entityId, versionId, deletedAt: null } });
  if (!ent) throw new HttpError(404, "Entry not found.");
  const refs = await findEntityReferences(versionId, entityId);
  const perm = canManageEntity(user, ctx, "delete", [...new Set(refs.map((r) => r.subsectionId))]);
  if (!perm.ok) throw new HttpError(403, perm.reason);

  if (refs.length && !unlink) {
    // Never silently break references: report them and let the owner choose.
    throw new HttpError(
      409,
      "This entry is still used. Choose whether to remove it from those answers, or keep it.",
      refs.map(({ fieldId, label, recordId, subsectionId }) => ({ fieldId, label, recordId, subsectionId })),
    );
  }
  const claim = await prisma.entity.updateMany({
    where: { id: ent.id, revision: baseRevision, deletedAt: null },
    data: { deletedAt: new Date(), revision: { increment: 1 } },
  });
  if (claim.count !== 1) throw new HttpError(409, "This entry was changed by someone else. Reload and try again.");
  for (const r of refs) {
    const next = Array.isArray(r.value) ? (r.value as string[]).filter((v) => v !== entityId) : null;
    await prisma.responseField.updateMany({
      where: { id: r.rowId, revision: r.revision },
      data: {
        value: next === null ? Prisma.DbNull : (next as Prisma.InputJsonValue),
        revision: { increment: 1 },
        lastEditorId: user.id,
        lastEditedAt: new Date(),
      },
    });
  }
  return { unlinked: refs.length };
}
