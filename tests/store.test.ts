import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentStore } from "@/components/form/store";
import { pageStub } from "./helpers";

type Handler = (body: { changes: { fieldId: string; recordId: string; baseRevision: number; value: unknown; state: string }[] }) => unknown | Promise<unknown>;

function mockFetch(handler: Handler, status = 200) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? "{}");
    const out = await handler(body);
    return { ok: status >= 200 && status < 300, status, json: async () => out } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const saved = (rev: number, value: unknown = "x") => ({
  value,
  state: "ANSWERED" as const,
  rationale: null,
  revision: rev,
  editorName: "Alex Rowan",
  lastEditedAt: "2026-11-07T10:00:00.000Z",
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("autosave store", () => {
  it("saves an edit, records the new revision and reports clean", async () => {
    mockFetch((b) => ({
      results: b.changes.map((c) => ({ fieldId: c.fieldId, recordId: c.recordId, status: "saved", saved: saved(1, c.value) })),
    }));
    const store = new AssessmentStore(pageStub());
    store.edit("A.description", "", { value: "hello" });
    expect(store.summary().dirty).toBe(1);
    const ok = await store.flush();
    expect(ok).toBe(true);
    const f = store.get("A.description")!;
    expect(f.status).toBe("clean");
    expect(f.baseRevision).toBe(1);
    expect(store.hasUnsaved()).toBe(false);
  });

  it("never claims success when persistence fails, and keeps the local value", async () => {
    mockFetch(() => ({ error: "Database cannot be reached" }), 503);
    const store = new AssessmentStore(pageStub());
    store.edit("A.description", "", { value: "important text" });
    const ok = await store.flush();
    expect(ok).toBe(false);
    const f = store.get("A.description")!;
    expect(f.status).toBe("failed");
    expect(f.value).toBe("important text");
    expect(store.hasUnsaved()).toBe(true);
    expect(store.lastSavedAt).toBeNull();
    expect(store.lastError).toMatch(/Database/);
  });

  it("treats a network failure as a failed save and can retry successfully", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const store = new AssessmentStore(pageStub());
    store.edit("A.description", "", { value: "text" });
    expect(await store.flush()).toBe(false);
    expect(store.get("A.description")!.status).toBe("failed");
    mockFetch((b) => ({ results: b.changes.map((c) => ({ fieldId: c.fieldId, recordId: c.recordId, status: "saved", saved: saved(1, c.value) })) }));
    expect(await store.flush()).toBe(true); // retry sends the preserved value
    expect(store.get("A.description")!.status).toBe("clean");
  });

  it("does not let a delayed response mark newer edits as saved", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    mockFetch(async (b) => {
      calls++;
      if (calls === 1) await gate; // first request is slow
      return { results: b.changes.map((c) => ({ fieldId: c.fieldId, recordId: c.recordId, status: "saved", saved: saved(calls, c.value) })) };
    });
    const store = new AssessmentStore(pageStub());
    store.edit("A.description", "", { value: "first" });
    const p = store.flush();
    await Promise.resolve();
    store.edit("A.description", "", { value: "second" }); // typed while request 1 is in flight
    release();
    await p;
    const f = store.get("A.description")!;
    expect(f.value).toBe("second");
    expect(f.status).toBe("clean"); // second edit was sent in a later round, against the newer revision
    expect(calls).toBe(2);
  });

  it("surfaces a conflict without overwriting, and 'Use mine' resubmits against the latest revision", async () => {
    const seen: number[] = [];
    mockFetch((b) => {
      const c = b.changes[0];
      seen.push(c.baseRevision);
      if (c.baseRevision < 5) {
        return { results: [{ fieldId: c.fieldId, recordId: c.recordId, status: "conflict", saved: saved(5, "their text") }] };
      }
      return { results: [{ fieldId: c.fieldId, recordId: c.recordId, status: "saved", saved: saved(6, c.value) }] };
    });
    const store = new AssessmentStore(pageStub({ fields: { "A.description|": { ...saved(2, "old"), rationale: null } } }));
    store.edit("A.description", "", { value: "my text" });
    expect(await store.flush()).toBe(false);
    let f = store.get("A.description")!;
    expect(f.status).toBe("conflict");
    expect(f.value).toBe("my text"); // my value preserved
    expect((f.conflictSaved as { value: unknown }).value).toBe("their text");
    store.useMine("A.description", "");
    await store.flush();
    f = store.get("A.description")!;
    expect(seen).toEqual([2, 5]); // second attempt used the latest revision, not an unchecked overwrite
    expect(f.status).toBe("clean");
    expect(f.baseRevision).toBe(6);
  });

  it("'Keep saved' adopts the saved answer", async () => {
    mockFetch((b) => ({ results: [{ fieldId: b.changes[0].fieldId, recordId: "", status: "conflict", saved: saved(5, "their text") }] }));
    const store = new AssessmentStore(pageStub({ fields: { "A.description|": saved(2, "old") } }));
    store.edit("A.description", "", { value: "mine" });
    await store.flush();
    store.keepSaved("A.description", "");
    const f = store.get("A.description")!;
    expect(f.value).toBe("their text");
    expect(f.status).toBe("clean");
    expect(f.baseRevision).toBe(5);
  });

  it("does not send invalid values and marks them for attention", async () => {
    const fn = mockFetch(() => ({ results: [] }));
    const store = new AssessmentStore(pageStub());
    store.edit("D.launchDate", "", { value: "2027-13-45" });
    await store.flush();
    expect(fn).not.toHaveBeenCalled();
    const f = store.get("D.launchDate")!;
    expect(f.status).toBe("rejected");
    expect(f.error).toMatch(/valid date/);
    expect(store.hasUnsaved()).toBe(true);
  });

  it("keeps 'Not sure' and 'Complete later' as unresolved states, not values", async () => {
    mockFetch((b) => ({ results: b.changes.map((c) => ({ fieldId: c.fieldId, recordId: c.recordId, status: "saved", saved: { ...saved(1, null), state: c.state } })) }));
    const store = new AssessmentStore(pageStub());
    store.edit("C.q3", "", { state: "NOT_SURE" });
    await store.flush();
    const f = store.get("C.q3")!;
    expect(f.state).toBe("NOT_SURE");
    expect(f.value).toBeUndefined();
  });

  it("derives the answer state from the value", () => {
    const store = new AssessmentStore(pageStub());
    store.edit("A.description", "", { value: "text" });
    expect(store.get("A.description")!.state).toBe("ANSWERED");
    store.edit("A.description", "", { value: "" });
    expect(store.get("A.description")!.state).toBe("UNANSWERED");
  });

  it("debounces autosave", async () => {
    const fn = mockFetch((b) => ({ results: b.changes.map((c) => ({ fieldId: c.fieldId, recordId: c.recordId, status: "saved", saved: saved(1, c.value) })) }));
    const store = new AssessmentStore(pageStub());
    store.edit("A.description", "", { value: "a" });
    store.edit("A.description", "", { value: "ab" });
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
