/**
 * Replaces the `.input-resizer` spans from question_view.html: a hidden span
 * mirrored each input's text so jQuery could measure it and size the input.
 *
 * CSS `field-sizing: content` does this natively where supported. Elsewhere
 * the text is measured on a canvas using the input's own font.
 */

import type { Directive } from "vue";

const nativeSupport = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
let context: CanvasRenderingContext2D | null = null;

function resize(el: HTMLInputElement): void {
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) return;

  const style = getComputedStyle(el);
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const text = el.value || el.placeholder;
  el.style.width = `${Math.ceil(context.measureText(text).width) + 20}px`;
}

const onInput = (event: Event) => resize(event.target as HTMLInputElement);

export const vAutoWidth: Directive<HTMLInputElement> = {
  mounted(el) {
    if (nativeSupport) {
      el.style.setProperty("field-sizing", "content");
      return;
    }
    el.addEventListener("input", onInput);
    resize(el);
    // The 'league' webfont may not be loaded yet, which changes the metrics.
    void document.fonts?.ready.then(() => el.isConnected && resize(el));
  },
  updated(el) {
    if (!nativeSupport) resize(el);
  },
  unmounted(el) {
    el.removeEventListener("input", onInput);
  },
};
