// Optimistic concurrency decision (architecture.md section 8). Pure.

export type RevisionDecision = "write" | "conflict";

/**
 * baseRevision: revision the client loaded (0 = the client believes the field does not exist yet).
 * storedRevision: current revision in the database (undefined = no row).
 * The write itself must still be conditional in the database (updateMany ... where revision = base)
 * so that the check and write are atomic.
 */
export function decideRevision(
  baseRevision: number,
  storedRevision: number | undefined,
): RevisionDecision {
  if (storedRevision === undefined) return baseRevision === 0 ? "write" : "conflict";
  return storedRevision === baseRevision ? "write" : "conflict";
}
