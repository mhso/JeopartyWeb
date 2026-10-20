/**
 * One global keydown listener, dispatched against the current state.
 *
 * presenter.js reassigns `window.onkeydown = function(e) {...}` in roughly
 * fifteen places, so "what does Space do right now" is only answerable by
 * tracing which closure was installed last -- and a stale closure silently
 * wins if two paths race. This inverts that: the listener is registered once,
 * and the *handler set* is swapped as a value.
 */

import { onScopeDispose, ref, type Ref } from "vue";

export const ACTION_KEY = "Space";

export interface KeyHandlers {
  /** Space -- "next beat", the presenter's main driver. */
  onAction?: (event: KeyboardEvent) => void;
  /** Ctrl+Z -- undo the last judgement. */
  onUndo?: (event: KeyboardEvent) => void;
  /** Number keys. 1 = correct / first choice, 2 = wrong / second choice, etc. */
  onDigit?: (digit: number, event: KeyboardEvent) => void;
  onEnter?: (event: KeyboardEvent) => void;
  onArrow?: (code: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight", event: KeyboardEvent) => void;
}

const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;

export function useActionKey() {
  const handlers: Ref<KeyHandlers> = ref({});

  function onKeyDown(event: KeyboardEvent): void {
    const h = handlers.value;

    if (event.ctrlKey && event.key === "z") {
      h.onUndo?.(event);
      return;
    }
    if (event.code === ACTION_KEY) {
      // Stops Space from re-triggering whatever button was last clicked.
      (document.activeElement as HTMLElement | null)?.blur();
      event.preventDefault();
      h.onAction?.(event);
      return;
    }
    if (event.code === "Enter") {
      h.onEnter?.(event);
      return;
    }
    if ((ARROWS as readonly string[]).includes(event.code)) {
      h.onArrow?.(event.code as (typeof ARROWS)[number], event);
      return;
    }
    const digit = Number.parseInt(event.key, 10);
    if (!Number.isNaN(digit)) {
      h.onDigit?.(digit, event);
    }
  }

  window.addEventListener("keydown", onKeyDown);
  onScopeDispose(() => window.removeEventListener("keydown", onKeyDown));

  /** Replaces the whole handler set -- call on every state transition. */
  function setHandlers(next: KeyHandlers): void {
    handlers.value = next;
  }

  function clearHandlers(): void {
    handlers.value = {};
  }

  return { setHandlers, clearHandlers };
}
