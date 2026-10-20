<script setup lang="ts">
/**
 * The buzz-in / answer timer.
 *
 * presenter.js wrote width and rgb() straight onto the element from inside a
 * setInterval (setCountdownValues / setCountdownText). Those are bindings now;
 * `useCountdown` owns only numbers.
 */
import type { Countdown } from "@shared/composables/useCountdown";
import { staticUrl } from "@shared/static";

defineProps<{ countdown: Countdown; frozen?: boolean }>();
</script>

<template>
  <div v-show="countdown.running.value" class="question-countdown-wrapper">
    <!-- Shown while the 'freeze' power-up is holding the clock. -->
    <div v-if="frozen" class="question-countdown-frozen">
      <img :src="staticUrl('img/frozen.png')" alt="Frozen" />
    </div>

    <div
      class="question-countdown-filled"
      :style="{ width: `${countdown.progress.value}%`, backgroundColor: countdown.color.value }"
    />
    <div class="question-countdown-text">{{ countdown.remaining.value.toFixed(2) }}</div>
  </div>
</template>
