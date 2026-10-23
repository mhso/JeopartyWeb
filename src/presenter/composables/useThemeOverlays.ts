/**
 * The current theme's overlays for a stage, shared between ThemeOverlay (which
 * renders them) and the views that need to trigger them, such as SelectionView
 * starting the intro media.
 *
 * ThemeOverlay is mounted once in App.vue, beside the RouterView, so views can't
 * reach it with a template ref. Instead it registers its intro element here.
 */
import { computed, shallowRef, toValue, type MaybeRefOrGetter } from "vue";

import type { MediaOverlay, StageType, ThemeOverlay } from "@shared/types";

import { useGameStore } from "../stores/game";

// Module scope: one ThemeOverlay exists, so one intro element at a time.
const introMedia = shallowRef<HTMLMediaElement | null>(null);

export function isIntroOverlay(overlay: ThemeOverlay): overlay is MediaOverlay {
  return overlay.type === "intro_audio" || overlay.type === "intro_video";
}

export function useThemeOverlays(stage: MaybeRefOrGetter<StageType>) {
  const store = useGameStore();

  const theme = computed(() => store.state?.theme ?? null);

  const overlays = computed<ThemeOverlay[]>(() => {
    const all = theme.value?.overlays ?? [];
    const startOfGame = store.state?.start_of_game ?? false;
    const current = toValue(stage);
    return all.filter((overlay) => {
      if (overlay.stage != null && overlay.stage !== current) return false;
      if (overlay.when === "start_of_game" && !startOfGame) return false;
      if (overlay.when === "not_start_of_game" && startOfGame) return false;
      return true;
    });
  });

  const intro = computed(() => overlays.value.find(isIntroOverlay) ?? null);

  function setIntroMedia(el: unknown): void {
    introMedia.value = (el as HTMLMediaElement | null) ?? null;
  }

  /** Plays the intro, if this stage has one. Returns its configured delay. */
  function playIntro(): number | undefined {
    if (!intro.value) return undefined;
    void introMedia.value?.play();
    return intro.value.delayMs;
  }

  return { theme, overlays, intro, setIntroMedia, playIntro };
}
