/**
 * Replaces startCountdown/stopCountdown/pauseCountdown in presenter.js
 * (lines 482-630), where the bar width and its red->green interpolation were
 * written straight onto element styles from inside a setInterval.
 *
 * Here the timer only owns numbers; the bar is `:style` bound to `progress`
 * and `color`. The `freeze` power-up becomes `countdown.paused = true` instead
 * of a module-level flag the interval checks.
 */

import { computed, onScopeDispose, ref, type Ref } from "vue";

const TICK_MS = 30;

export interface Countdown {
  /** Seconds left, 2dp, for the numeric readout. */
  remaining: Ref<number>;
  /** 0-100, for the bar width. */
  progress: Ref<number>;
  running: Ref<boolean>;
  paused: Ref<boolean>;
  /** Interpolated bar colour, matching the original rgb(red, green, 0) ramp. */
  color: Ref<string>;
  start: (durationSeconds: number, onExpire?: () => void) => void;
  stop: () => void;
}

export function useCountdown(): Countdown {
  const remaining = ref(0);
  const progress = ref(0);
  const running = ref(false);
  const paused = ref(false);

  let handle: number | null = null;
  let elapsedMs = 0;
  let durationMs = 0;

  const color = computed(() => {
    // Original ramp: red climbs 136 -> 255, then green falls 255 -> 0.
    const t = Math.min(Math.max(progress.value / 100, 0), 1);
    const total = 255 + 136;
    const travelled = t * total;
    const red = Math.min(136 + travelled, 255);
    const green = travelled > 119 ? Math.max(255 - (travelled - 119), 0) : 255;
    return `rgb(${red.toFixed(0)}, ${green.toFixed(0)}, 0)`;
  });

  function stop(): void {
    if (handle !== null) {
      clearInterval(handle);
      handle = null;
    }
    running.value = false;
    paused.value = false;
    progress.value = 0;
    remaining.value = 0;
  }

  function start(durationSeconds: number, onExpire?: () => void): void {
    stop();
    durationMs = durationSeconds * 1000;
    elapsedMs = 0;
    running.value = true;
    paused.value = false;
    remaining.value = durationSeconds;

    handle = window.setInterval(() => {
      if (paused.value) return;

      elapsedMs += TICK_MS;
      progress.value = Math.min((elapsedMs / durationMs) * 100, 100);
      remaining.value = Math.max((durationMs - elapsedMs) / 1000, 0);

      if (elapsedMs >= durationMs) {
        stop();
        onExpire?.();
      }
    }, TICK_MS);
  }

  onScopeDispose(stop);

  return { remaining, progress, running, paused, color, start, stop };
}
