<script setup lang="ts">
/**
 * Ports templates/presenter/connection_status.html, which carried its own
 * inline <script> with a setInterval, a mutable `statusText`, and two globals
 * (`setConnectionStatusWaiting`, `hideConnectionStatus`) that the page
 * templates called into.
 *
 * With a persistent socket this is much less load-bearing than it was -- it
 * only shows during the initial connect, not on every stage change.
 */
import { computed, onUnmounted, ref, watch } from "vue";

import { pageStrings } from "@shared/i18n";
import { useGameStore } from "../stores/game";

const store = useGameStore();
const t = pageStrings("global");

const dots = ref("");
const timer = window.setInterval(() => {
  dots.value = dots.value.length >= 3 ? "" : `${dots.value}.`;
}, 1000);
onUnmounted(() => clearInterval(timer));

const visible = computed(() => !store.connected || !store.contestantsReady);
const label = computed(() => (store.connected ? t("waiting") : t("connecting")));

// Stop animating once we're through -- avoids a pointless repaint every second
// for the rest of the game.
watch(visible, (isVisible) => !isVisible && clearInterval(timer));
</script>

<template>
  <div v-if="visible" id="connection-status-wrapper">
    <div id="connection-status">{{ label }}{{ dots }}</div>
  </div>
</template>
