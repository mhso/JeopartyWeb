<script setup lang="ts">
/**
 * The buzzer plus the power-up bar.
 *
 * In the original this was four <img> tags and a status overlay toggled with
 * `.d-none` from eight different socket handlers. Here it's one enum off the
 * store, driving one <img>.
 */
import { computed } from "vue";

import { pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";

import { useGameStore } from "../stores/game";
import PowerUpBar from "./PowerUpBar.vue";

const store = useGameStore();
const t = pageStrings("contestant/game");

const BUZZER_IMAGES = {
  inactive: "img/buzzer_inactive.png",
  active: "img/buzzer_active.png",
  pressed: "img/buzzer_pressed.png",
  won: "img/buzzer_inactive.png",
  lost: "img/buzzer_inactive.png",
} as const;

const buzzerSrc = computed(() => staticUrl(BUZZER_IMAGES[store.buzzer]));
const resultSrc = computed(() => {
  if (store.buzzer === "won") return staticUrl("img/check.png");
  if (store.buzzer === "lost") return staticUrl("img/error.png");
  return undefined;
});
</script>

<template>
  <h2 id="question-category-header">
    <span id="question-category-name">{{ store.state?.question?.category.name }}</span>
    <br />
    <span>
      {{ t("for") }}
      <span id="question-reward-span">{{ store.state?.question?.value }} {{ t("points") }}</span>
    </span>
  </h2>

  <div id="buzzer-wrapper" @click="store.pressBuzzer()" :class="store.buzzer">
    <img :src="buzzerSrc" alt="Buzzer" />
  </div>

  <div v-if="resultSrc" :key="resultSrc" id="contestant-buzzer-status" class="flash">
    <img :src="resultSrc" alt="" />
  </div>

  <PowerUpBar />
</template>
