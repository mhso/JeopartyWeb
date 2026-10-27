<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";

import { themeAssetUrl } from "@shared/static";

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

function waitForInit() {
  const done = watch(
    () => store.presenterJoined,
    (joined) => {
      if (joined) {
        void nextTick(() => {
          done();
          store.emit.stageReady();
        });
      }
    },
    {immediate: true}
  );
}

// The handshake from API_BLUEPRINT.md: once a new stage has rendered, tell the
// server, which broadcasts `state_changed` so contestants refetch. A fresh
// page load is covered by the store's `presenter_joined` handler instead.
watch(
  () => route.name,
  (name, previous) => {
    if (previous && name !== previous) {
      waitForInit();
    }
  },
);

const backgroundStyle = computed(() => {
  const image = store.state?.theme?.bg_image;
  const themeId = `data/themes/${store.state?.theme?.id}`;
  return image ? { backgroundImage: `url(${themeAssetUrl(themeId, image)})` } : undefined;
});

// The contestant strip is absent from the lobby (which has its own list) and
// the endscreen (which has the scores table).
const showFooter = computed(() => store.stage !== "lobby" && store.stage !== "ended");
</script>

<template>
  <div v-if="store.stage != 'question' || !store.question?.category.bg_image"
      class="bg-fill" :class="{ 'bg-image': backgroundStyle }" :style="backgroundStyle" />

  <ConnectionStatus v-if="store.stage && store.stage !== 'lobby'" />
  <ThemeOverlay :stage="store.stage" />

  <RouterView v-if="store.state" />

  <PresenterFooter v-if="showFooter" />
</template>
