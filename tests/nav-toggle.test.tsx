import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("next/link", () => ({ default: () => null }));

import { NavToggle } from "@/components/form/Shell";

describe("navigation toggle", () => {
  it("is a labelled button exposing expanded state and the controlled panel", () => {
    const open = renderToString(<NavToggle open toggle={() => undefined} />);
    expect(open).toContain("Hide navigation");
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('aria-controls="assessment-nav"');
    const closed = renderToString(<NavToggle open={false} toggle={() => undefined} />);
    expect(closed).toContain("Show navigation");
    expect(closed).toContain('aria-expanded="false"');
  });
});
