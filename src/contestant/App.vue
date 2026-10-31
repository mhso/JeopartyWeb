<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { staticUrl } from "@shared/static";
import { useWakeLock } from "@shared/composables/useWakeLock";
import { useGameStore } from "./stores/game";

const store = useGameStore();

// Keep the phone screen on for the whole session, across route changes.
useWakeLock().install();

/** The per-contestant background image, picked at join time. */
const background = computed(() => {
  const image = store.me?.bg_image;
  return image ? { backgroundImage: `url(${staticUrl(image)})` } : undefined;
});

// The old game.html made <body> transparent when a background image was set.
// Otherwise the opaque body colour can paint over the z-index:-1 image on mobile.
watchEffect(() => document.body.classList.toggle("has-bg-image", !!background.value));
</script>

<template>
  <div v-if="background" id="bg-image" :style="background" />
  <RouterView />
</template>
