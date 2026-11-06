<script setup lang="ts">
/**
 * The buzzer plus the power-up bar.
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

  <div v-if="resultSrc" :key="resultSrc" id="contestant-buzzer-status">
    <img :src="resultSrc" alt="" />
  </div>

  <PowerUpBar />
</template>

<style scoped src="../styles/category_name.css"></style>

<style scoped>
#question-category-header {
  color: white;
  font-family: Garamond, serif;
  font-size: 1.75rem;
  margin-top: 15px;
  margin-bottom: 25px;
}

#question-reward-span {
  color: gold;
  font-weight: 1000;
}

#buzzer-wrapper {
  touch-action: manipulation;
  margin-bottom: 10px;
}

#buzzer-wrapper > img {
  width: 200px;
  touch-action: manipulation;
}

@keyframes showBuzzerStatus {
    0% {
        opacity: 0;
        transform: scale(0.2);
    }
    33% {
        opacity: 1;
    }
    100% {
        transform: scale(1);
    }
}

#contestant-buzzer-status {
  position: fixed;
  background-color: rgba(0, 0, 0, 0.662);
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 99;
  text-align: center;
}

#contestant-buzzer-status > img {
  width: 90vw;
  position: relative;
  top: calc(50% - 45vw);
  animation: showBuzzerStatus 2.5s ease forwards;
}
</style>
