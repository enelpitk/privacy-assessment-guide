// The in-page confirmation step for governance actions, as a small pure state machine so that it can be tested
// without a browser. Pressing the action button asks first; "Cancel" runs nothing; "Yes, continue" runs the action once.

export interface ConfirmStep {
  /** Whether the confirmation prompt is shown. */
  asking: boolean;
  /** Whether the action should be sent to the server now. */
  run: boolean;
}

/** The action button was pressed. Without a confirmation text the action runs at once; with one, the prompt is toggled. */
export function pressAction(asking: boolean, hasConfirmation: boolean): ConfirmStep {
  if (!hasConfirmation) return { asking: false, run: true };
  return { asking: !asking, run: false };
}

/** "Yes, continue" was pressed. It runs the action only while the prompt is shown, so it cannot fire twice. */
export function pressYes(asking: boolean): ConfirmStep {
  return asking ? { asking: false, run: true } : { asking: false, run: false };
}

/** "Cancel" was pressed: nothing is sent. */
export function pressCancel(): ConfirmStep {
  return { asking: false, run: false };
}
