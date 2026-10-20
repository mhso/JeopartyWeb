<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";

import { staticUrl } from "@shared/static";

import ConnectionStatus from "./components/ConnectionStatus.vue";
import PresenterFooter from "./components/PresenterFooter.vue";
import ThemeOverlay from "./components/ThemeOverlay.vue";
import { useGameStore } from "./stores/game";

const route = useRoute();
const store = useGameStore();

// Mounted once for the whole session, not per stage -- this is what keeps the
// socket alive across navigations.
onMounted(() => store.init(String(route.params.gameId)));
onUnmounted(() => store.teardown());

const backgroundStyle = computed(() => {
  const image = store.state?.theme?.bg_image;
  return image ? { backgroundImage: `url(${staticUrl(image)})` } : undefined;
});

// The contestant strip is absent from the lobby (which has its own list) and
// the endscreen (which has the scores table).
const showFooter = computed(() => store.stage !== "lobby" && store.stage !== "ended");
</script>

<template>
  <div class="bg-fill" :class="{ 'bg-image': backgroundStyle }" :style="backgroundStyle" />

  <ConnectionStatus v-if="store.stage && store.stage !== 'lobby'" />
  <ThemeOverlay :stage="store.stage" />

  <RouterView v-if="store.state" />

  <PresenterFooter v-if="showFooter" />
</template>
