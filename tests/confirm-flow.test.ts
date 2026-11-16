import { describe, expect, it } from "vitest";
import { pressAction, pressCancel, pressYes } from "@/components/form/confirmFlow";

describe("in-page confirmation of governance actions", () => {
  it("an action without a confirmation text runs at once", () => {
    expect(pressAction(false, false)).toEqual({ asking: false, run: true });
  });
  it("pressing an action with a confirmation text only asks; nothing is sent yet", () => {
    expect(pressAction(false, true)).toEqual({ asking: true, run: false });
  });
  it("Cancel closes the prompt and sends nothing", () => {
    const asked = pressAction(false, true);
    expect(asked.asking).toBe(true);
    expect(pressCancel()).toEqual({ asking: false, run: false });
  });
  it("Yes, continue sends the action once and closes the prompt", () => {
    expect(pressYes(true)).toEqual({ asking: false, run: true });
  });
  it("Yes, continue cannot send the action when the prompt is not shown (no double submission)", () => {
    expect(pressYes(false)).toEqual({ asking: false, run: false });
  });
  it("pressing the action button again while the prompt is shown closes it without sending", () => {
    expect(pressAction(true, true)).toEqual({ asking: false, run: false });
  });
  it("a full sequence: ask, cancel, ask again, confirm sends exactly one request", () => {
    let asking = false;
    let sent = 0;
    const apply = (s: { asking: boolean; run: boolean }) => {
      asking = s.asking;
      if (s.run) sent++;
    };
    apply(pressAction(asking, true)); // press
    apply(pressCancel()); // cancel
    expect(sent).toBe(0);
    apply(pressAction(asking, true)); // press again
    apply(pressYes(asking)); // confirm
    apply(pressYes(asking)); // a second confirm click does nothing
    expect(sent).toBe(1);
    expect(asking).toBe(false);
  });
});
