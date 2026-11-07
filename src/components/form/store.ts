// Client-side document store: local edits, server-backed autosave, conflict handling.
// The server is the source of truth. Nothing here is persisted in the browser.
import { fieldIndex } from "@/content";
import type { AnswerState } from "@/domain/conditions";
import type { RespRow } from "@/domain/model";
import { isEmptyValue, validateValue } from "@/domain/validation";
import {
  fieldKey,
  type ClientEntity,
  type ClientField,
  type ClientRecord,
  type PageData,
} from "@/lib/types";

export type FieldStatus = "clean" | "dirty" | "saving" | "failed" | "conflict" | "rejected";

export interface SavedValue {
  value: unknown;
  state: AnswerState;
  rationale: string | null;
  revision: number;
  editorName: string;
  lastEditedAt: string;
}

export interface FieldState {
  fieldId: string;
  recordId: string;
  value: unknown;
  state: AnswerState;
  rationale: string | null;
  baseRevision: number;
  editorName?: string;
  lastEditedAt?: string;
  status: FieldStatus;
  /** Local edit counter; used to ignore stale responses. */
  version: number;
  error?: string;
  conflictSaved?: SavedValue | null;
}

export interface Summary {
  dirty: number;
  saving: number;
  failed: number;
  conflicts: number;
  rejected: number;
}

type Result =
  | { fieldId: string; recordId: string; status: "saved"; saved: SavedValue }
  | { fieldId: string; recordId: string; status: "conflict"; saved: SavedValue | null }
  | { fieldId: string; recordId: string; status: "rejected"; reason: string };

interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T & { error?: string; details?: unknown };
}

async function call<T = unknown>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    let data: unknown = {};
    try {
      data = await res.json();
    } catch {
      /* non-JSON response */
    }
    return { ok: res.ok, status: res.status, data: data as ApiResult<T>["data"] };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error: could not reach the server." } as ApiResult<T>["data"] };
  }
}

const DEBOUNCE_MS = 900;

export class AssessmentStore {
  fields = new Map<string, FieldState>();
  records: ClientRecord[];
  entities: ClientEntity[];
  readonly assessmentId: string;
  lastSavedAt: Date | null = null;
  lastError: string | null = null;
  private listeners = new Set<() => void>();
  private rev = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean> | null = null;

  constructor(initial: PageData) {
    this.assessmentId = initial.assessment.id;
    this.records = [...initial.records];
    this.entities = [...initial.entities];
    for (const [key, f] of Object.entries(initial.fields)) this.load(key, f);
  }

  private load(key: string, f: ClientField) {
    const [fieldId, recordId] = key.split("|");
    this.fields.set(key, {
      fieldId,
      recordId: recordId ?? "",
      value: f.value,
      state: f.state,
      rationale: f.rationale,
      baseRevision: f.revision,
      editorName: f.editorName,
      lastEditedAt: f.lastEditedAt,
      status: "clean",
      version: 0,
    });
  }

  // ---- subscription (useSyncExternalStore)
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.rev;
  private emit() {
    this.rev++;
    this.listeners.forEach((l) => l());
  }

  // ---- reads
  get(fieldId: string, recordId = ""): FieldState | undefined {
    return this.fields.get(fieldKey(fieldId, recordId));
  }

  responses(): RespRow[] {
    return [...this.fields.values()].map((f) => ({
      fieldId: f.fieldId,
      recordId: f.recordId,
      value: f.value,
      state: f.state,
      rationale: f.rationale,
    }));
  }

  summary(): Summary {
    const s: Summary = { dirty: 0, saving: 0, failed: 0, conflicts: 0, rejected: 0 };
    for (const f of this.fields.values()) {
      if (f.status === "dirty") s.dirty++;
      else if (f.status === "saving") s.saving++;
      else if (f.status === "failed") s.failed++;
      else if (f.status === "conflict") s.conflicts++;
      else if (f.status === "rejected") s.rejected++;
    }
    return s;
  }

  hasUnsaved(): boolean {
    const s = this.summary();
    return s.dirty + s.saving + s.failed + s.conflicts + s.rejected > 0;
  }

  // ---- edits
  edit(
    fieldId: string,
    recordId: string,
    patch: { value?: unknown; state?: AnswerState; rationale?: string | null },
    hasValue = "value" in patch,
  ) {
    const key = fieldKey(fieldId, recordId);
    const def = fieldIndex.get(fieldId)?.def;
    let f = this.fields.get(key);
    if (!f) {
      f = {
        fieldId,
        recordId,
        value: undefined,
        state: "UNANSWERED",
        rationale: null,
        baseRevision: 0,
        status: "clean",
        version: 0,
      };
      this.fields.set(key, f);
    }
    if (hasValue) f.value = patch.value;
    if (patch.state) f.state = patch.state;
    else if (hasValue && def) {
      if (isEmptyValue(def, f.value)) {
        if (f.state === "ANSWERED") f.state = "UNANSWERED";
      } else if (f.state === "UNANSWERED" || f.state === "NOT_APPLICABLE") {
        f.state = "ANSWERED";
      }
    }
    if ("rationale" in patch) f.rationale = patch.rationale ?? null;
    f.version++;
    if (f.status !== "conflict") f.status = "dirty";
    f.error = def && hasValue ? (validateValue(def, f.value) ?? undefined) : f.error;
    this.emit();
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  /**
   * Sends all pending edits. Resolves true only when nothing is left unsaved or in conflict.
   * One request is in flight at a time, so a delayed response can never overwrite newer local edits.
   */
  flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.running) return this.running;
    this.running = this.runFlush().finally(() => {
      this.running = null;
      this.emit();
    });
    return this.running;
  }

  private async runFlush(): Promise<boolean> {
    for (let round = 0; round < 6; round++) {
      const pending: FieldState[] = [];
      for (const f of this.fields.values()) {
        if (f.status !== "dirty" && f.status !== "failed") continue;
        const def = fieldIndex.get(f.fieldId)?.def;
        const err = def ? validateValue(def, f.value) : "Unknown field.";
        if (err) {
          f.status = "rejected";
          f.error = err;
          continue;
        }
        pending.push(f);
      }
      this.emit();
      if (pending.length === 0) return !this.hasUnsaved();

      const sent = new Map(pending.map((f) => [fieldKey(f.fieldId, f.recordId), f.version]));
      for (const f of pending) f.status = "saving";
      this.lastError = null;
      this.emit();

      const res = await call<{ results: Result[] }>("PATCH", `/api/assessments/${this.assessmentId}/fields`, {
        changes: pending.map((f) => ({
          fieldId: f.fieldId,
          recordId: f.recordId,
          baseRevision: f.baseRevision,
          value: f.value === undefined ? null : f.value,
          state: f.state,
          rationale: f.rationale,
        })),
      });

      if (!res.ok || !res.data.results) {
        // Persistence failed: never claim success. Keep the local values and mark them failed.
        this.lastError =
          res.data.error ?? (res.status === 0 ? "Network error: could not reach the server." : "The server could not save your changes.");
        for (const f of pending) f.status = "failed";
        this.emit();
        return false;
      }

      for (const r of res.data.results) {
        const key = fieldKey(r.fieldId, r.recordId);
        const f = this.fields.get(key);
        if (!f) continue;
        const sentVersion = sent.get(key);
        if (r.status === "saved") {
          f.baseRevision = r.saved.revision;
          f.editorName = r.saved.editorName;
          f.lastEditedAt = r.saved.lastEditedAt;
          // If the user edited again while this request was in flight, stay dirty (against the new revision).
          f.status = f.version === sentVersion ? "clean" : "dirty";
          if (f.status === "clean") f.error = undefined;
          this.lastSavedAt = new Date();
        } else if (r.status === "conflict") {
          f.status = "conflict";
          f.conflictSaved = r.saved;
        } else {
          f.status = "rejected";
          f.error = r.reason;
        }
      }
      this.emit();
    }
    return !this.hasUnsaved();
  }

  // ---- conflict resolution (always re-checked against the latest revision by the server)
  keepSaved(fieldId: string, recordId: string) {
    const f = this.get(fieldId, recordId);
    if (!f || f.status !== "conflict") return;
    const s = f.conflictSaved;
    f.value = s ? s.value : undefined;
    f.state = s ? s.state : "UNANSWERED";
    f.rationale = s ? s.rationale : null;
    f.baseRevision = s ? s.revision : 0;
    f.editorName = s?.editorName;
    f.lastEditedAt = s?.lastEditedAt;
    f.conflictSaved = undefined;
    f.status = "clean";
    f.version++;
    f.error = undefined;
    this.emit();
  }

  /** Re-submits the user's value against the latest saved revision. Not an unchecked overwrite. */
  useMine(fieldId: string, recordId: string, merged?: unknown) {
    const f = this.get(fieldId, recordId);
    if (!f || f.status !== "conflict") return;
    if (merged !== undefined) f.value = merged;
    f.baseRevision = f.conflictSaved ? f.conflictSaved.revision : 0;
    f.conflictSaved = undefined;
    f.status = "dirty";
    f.version++;
    this.emit();
    void this.flush();
  }

  // ---- structure (records)
  private purgeRecords(ids: Set<string>) {
    for (const [k, f] of this.fields) if (ids.has(f.recordId)) this.fields.delete(k);
  }

  async addRecord(collection: string, parentId: string | null): Promise<string | null> {
    const res = await call<ClientRecord>("POST", `/api/assessments/${this.assessmentId}/records`, {
      collection,
      parentId,
    });
    if (!res.ok) return res.data.error ?? "Could not add the entry.";
    this.records = [...this.records, res.data as ClientRecord];
    this.emit();
    return null;
  }

  async removeRecord(recordId: string): Promise<string | null> {
    const rec = this.records.find((r) => r.id === recordId);
    if (!rec) return null;
    await this.flush();
    const res = await call("DELETE", `/api/assessments/${this.assessmentId}/records/${recordId}`, {
      baseRevision: rec.revision,
    });
    if (!res.ok) return res.data.error ?? "Could not remove the entry.";
    const gone = new Set<string>([recordId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of this.records) {
        if (r.parentId && gone.has(r.parentId) && !gone.has(r.id)) {
          gone.add(r.id);
          grew = true;
        }
      }
    }
    this.records = this.records.filter((r) => !gone.has(r.id));
    this.purgeRecords(gone);
    this.emit();
    return null;
  }

  async moveRecord(recordId: string, direction: "up" | "down"): Promise<string | null> {
    const rec = this.records.find((r) => r.id === recordId);
    if (!rec) return null;
    const res = await call("PATCH", `/api/assessments/${this.assessmentId}/records/${recordId}`, {
      direction,
      baseRevision: rec.revision,
    });
    if (!res.ok) return res.data.error ?? "Could not move the entry.";
    // The server swapped orderings and bumped revisions; refresh the local view from it.
    return "RELOAD";
  }

  // ---- shared entities
  async createEntity(kind: ClientEntity["kind"], name: string): Promise<{ entity?: ClientEntity; error?: string }> {
    const res = await call<ClientEntity & { existed: boolean }>("POST", `/api/assessments/${this.assessmentId}/entities`, {
      kind,
      name,
    });
    if (!res.ok) return { error: res.data.error ?? "Could not add the entry." };
    const e = res.data as ClientEntity;
    if (!this.entities.some((x) => x.id === e.id)) this.entities = [...this.entities, { id: e.id, kind: e.kind, name: e.name, revision: e.revision }];
    this.emit();
    return { entity: e };
  }

  async renameEntity(id: string, name: string): Promise<string | null> {
    const ent = this.entities.find((e) => e.id === id);
    if (!ent) return "Entry not found.";
    const res = await call<{ name: string; revision: number }>("PATCH", `/api/assessments/${this.assessmentId}/entities/${id}`, {
      name,
      baseRevision: ent.revision,
    });
    if (!res.ok) return res.data.error ?? "Could not rename the entry.";
    this.entities = this.entities.map((e) => (e.id === id ? { ...e, name: res.data.name, revision: res.data.revision } : e));
    this.emit();
    return null;
  }

  async deleteEntity(
    id: string,
    unlink: boolean,
  ): Promise<{ error?: string; references?: { label: string; subsectionId: string }[]; done?: boolean }> {
    const ent = this.entities.find((e) => e.id === id);
    if (!ent) return { error: "Entry not found." };
    await this.flush();
    const res = await call<unknown>("DELETE", `/api/assessments/${this.assessmentId}/entities/${id}`, {
      baseRevision: ent.revision,
      unlink,
    });
    if (res.status === 409 && Array.isArray(res.data.details)) {
      return { error: res.data.error, references: res.data.details as { label: string; subsectionId: string }[] };
    }
    if (!res.ok) return { error: res.data.error ?? "Could not delete the entry." };
    return { done: true };
  }
}
