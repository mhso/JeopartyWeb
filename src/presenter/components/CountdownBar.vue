<script setup lang="ts">
/**
 * The buzz-in / answer timer.
 *
 * presenter.js wrote width and rgb() straight onto the element from inside a
 * setInterval (setCountdownValues / setCountdownText). Those are bindings now;
 * `useCountdown` owns only numbers.
 */
import { computed } from "vue";

import type { Countdown } from "@shared/composables/useCountdown";
import { staticUrl } from "@shared/static";

import { TIMING, type FreezePhase } from "../composables/usePresenterFlow";

const props = defineProps<{ countdown: Countdown; freeze?: FreezePhase }>();

/**
 * The 'freeze' overlay fades in over 2s, then thaws almost to nothing over the
 * rest of the freeze -- afterFreezeUsed's two chained transitions. It stays
 * mounted so each change of phase animates from the last.
 */
const freezeStyle = computed(() => {
  switch (props.freeze) {
    case "in":
      return { opacity: 0.9, transition: `opacity ${TIMING.freezeFadeInSeconds}s` };
    case "thawing":
      return {
        opacity: 0.05,
        transition: `opacity ${TIMING.freezeSeconds - TIMING.freezeFadeInSeconds}s`,
      };
    default:
      return { opacity: 0, transition: "opacity 2s" };
  }
});
</script>

<template>
  <div v-show="countdown.running.value" class="question-countdown-wrapper" style="opacity: 1">
    <div class="question-countdown-frozen" :style="freezeStyle">
      <img :src="staticUrl('img/frozen.png')" alt="Frozen" />
    </div>

    <div
      class="question-countdown-filled"
      :style="{ width: `${countdown.progress.value}%`, backgroundColor: countdown.color.value }"
    />
    <div class="question-countdown-text">{{ countdown.remaining.value.toFixed(2) }}</div>
  </div>
</template>
