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

<style>
h1 {
  font-family: Garamond, serif;
  font-size: 2.5rem;
  color: #e6d86b;
  text-shadow: 1px 3px 2px rgba(0,0,0,0.75);
}

body.has-bg-image {
  background-color: transparent;
}
</style>

<style scoped>
#bg-image {
  position: fixed;
  z-index: -1;
  background-size: cover;
  backdrop-filter: blur(5px);
  background-blend-mode: luminosity;
  filter: blur(5px) brightness(0.55);
  height: 101%;
  width: 101%;
  top: -0.5%;
  left: -0.5%;
}
</style>
