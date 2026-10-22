/**
 * Sound effects for the presenter, kept outside the component tree.
 *
 * question.html declared every sound as an <audio> element on the page, so a
 * correct-answer jingle was cut off the moment the presenter pressed Space and
 * `goToPage` navigated away. Detached `Audio` objects keep playing after the
 * view that started them unmounts, which is all the old <AudioBank> idea needed
 * -- no component required.
 *
 * Elements are cached per URL, so `preload` on mount and `play` later share the
 * same buffered element.
 */

import { staticUrl } from "@shared/static";

const cache = new Map<string, HTMLAudioElement>();

function element(path: string): HTMLAudioElement | null {
  const url = staticUrl(path);
  if (!url) return null;

  let audio = cache.get(url);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = "auto";
    cache.set(url, audio);
  }
  return audio;
}

/** Starts buffering static-relative sound paths; nulls are skipped. */
export function preloadSounds(paths: Array<string | null | undefined>): void {
  for (const path of paths) {
    if (path) element(path);
  }
}

/**
 * Plays a static-relative sound from the start. Failures (autoplay policy,
 * missing file) are logged, never thrown -- a missing jingle must not stall
 * the question flow.
 */
export async function playSound(path: string | null | undefined, volume = 1): Promise<void> {
  const audio = path ? element(path) : null;
  if (!audio) return Promise.resolve();

  audio.volume = volume;
  audio.currentTime = 0;
  return audio.play().catch((err: unknown) => {
    console.warn(`Could not play sound '${path}':`, err);
  });
}

export function stopSound(path: string | null | undefined): void {
  const audio = path ? element(path) : null;
  if (audio && !audio.paused) audio.pause();
}

export const SOUNDS = {
  buzzer: "data/sounds/buzzer.mp3",
  suspense: "data/sounds/suspense.mp3",
} as const;
