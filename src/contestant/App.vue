<script setup lang="ts">
import { computed } from "vue";
import { staticUrl } from "@shared/static";
import { useGameStore } from "./stores/game";

const store = useGameStore();

/** The per-contestant background image, picked at join time. */
const background = computed(() => {
  const image = store.me?.bg_image;
  return image ? { backgroundImage: `url(${staticUrl(image)})` } : undefined;
});
</script>

<template>
  <div v-if="background" id="bg-image" :style="background" />
  <RouterView />
</template>
