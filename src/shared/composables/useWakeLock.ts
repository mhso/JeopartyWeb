/**
 * Keeps the contestant's phone screen awake during a game.
 * Ported from static/js/wake_lock.js.
 *
 * The lock is app-wide, not per view: releasing it when a view unmounts would
 * drop it on every route change (e.g. join -> game). iOS (WebKit, which every
 * iOS browser uses) is unreliable about granting the lock outside a user
 * gesture, so `install()` also re-requests it on any tap or key press while
 * none is held -- the same idea as the old frontend requesting it on buzz.
 *
 * Note: the API only exists in secure contexts (HTTPS or localhost).
 */

import { ref } from "vue";

const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
const active = ref(false);
let sentinel: WakeLockSentinel | null = null;
let pending: Promise<void> | null = null;
let installed = false;

async function acquire(): Promise<void> {
  try {
    const lock = await navigator.wakeLock.request("screen");
    sentinel = lock;
    active.value = true;
    lock.addEventListener("release", () => {
      if (sentinel === lock) sentinel = null;
      active.value = sentinel !== null;
    });
  } catch (err) {
    // NotAllowedError: no user gesture / not permitted. Otherwise usually a
    // system condition such as low battery. The next tap will retry.
    console.warn("Wake lock request failed:", err);
  }
}

function request(): Promise<void> {
  if (!supported || sentinel) return Promise.resolve();
  pending ??= acquire().finally(() => (pending = null));
  return pending;
}

async function release(): Promise<void> {
  const lock = sentinel;
  sentinel = null;
  active.value = false;
  await lock?.release();
}

function onGesture(): void {
  if (!sentinel) void request();
}

// Re-acquire when the tab becomes visible again -- the lock is dropped on hide.
function onVisibilityChange(): void {
  if (document.visibilityState === "visible") void request();
}

/** Wire up the app-wide listeners. Call once from the app root. */
function install(): void {
  if (!supported) {
    console.warn("Wake lock unsupported (requires HTTPS and a supporting browser).");
    return;
  }
  if (installed) return;
  installed = true;
  // Capture phase so it runs inside the gesture even if a handler stops propagation.
  window.addEventListener("click", onGesture, { capture: true });
  window.addEventListener("keydown", onGesture, { capture: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
}

export function useWakeLock() {
  return { supported, active, request, release, install };
}
