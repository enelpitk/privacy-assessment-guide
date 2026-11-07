import { describe, expect, it } from "vitest";
import { isVersionRejected, lifecycleLabel } from "@/lib/labels";

describe("lifecycle label for rejected versions", () => {
  it("labels only a finalised, rejected version as \"Finalised — Rejected\"", () => {
    expect(lifecycleLabel("FINALISED", true)).toBe("Finalised — Rejected");
    expect(lifecycleLabel("FINALISED", false)).toBe("Finalised");
    expect(lifecycleLabel("FINALISED")).toBe("Finalised");
    expect(lifecycleLabel("DRAFT", true)).toBe("Draft");
    expect(lifecycleLabel("ARCHIVED", true)).toBe("Archived");
  });
  it("uses the latest owner decision of the version", () => {
    const d = (versionId: string, decision: string, t: string) => ({ versionId, decision, createdAt: t });
    expect(isVersionRejected([d("v1", "REJECTED", "2026-11-08T10:00:00Z")], "v1")).toBe(true);
    expect(isVersionRejected([d("v1", "APPROVED", "2026-11-08T10:00:00Z")], "v1")).toBe(false);
    expect(isVersionRejected([d("v1", "CONDITIONALLY_APPROVED", "2026-11-08T10:00:00Z"), d("v1", "APPROVED", "2026-11-09T10:00:00Z")], "v1")).toBe(false);
    expect(isVersionRejected([d("v1", "REJECTED", "2026-11-08T10:00:00Z")], "v2")).toBe(false); // another version
    expect(isVersionRejected([], "v1")).toBe(false);
  });
});
