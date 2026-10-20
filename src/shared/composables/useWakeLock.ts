/**
 * Keeps the contestant's phone screen awake during a game.
 * Ported near-verbatim from static/js/wake_lock.js.
 */

import { onScopeDispose, ref } from "vue";

export function useWakeLock() {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const active = ref(false);
  let sentinel: WakeLockSentinel | null = null;

  async function request(): Promise<void> {
    if (!supported || sentinel) return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
      active.value = true;
      sentinel.addEventListener("release", () => {
        active.value = false;
        sentinel = null;
      });
    } catch {
      // Usually a system condition such as low battery. Not worth surfacing.
    }
  }

  async function release(): Promise<void> {
    await sentinel?.release();
    sentinel = null;
    active.value = false;
  }

  // Re-acquire when the tab becomes visible again -- the lock is dropped on hide.
  function onVisibilityChange(): void {
    if (document.visibilityState === "visible") void request();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  onScopeDispose(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    void release();
  });

  return { supported, active, request, release };
}
