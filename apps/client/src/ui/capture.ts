import type { PointerEvent } from 'react';

/** Keep receiving pointer events after the finger leaves the element. Never throws. */
export function capturePointer(e: PointerEvent<Element>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // Some pointer sources (and synthetic events) cannot be captured; holding still works.
  }
}
