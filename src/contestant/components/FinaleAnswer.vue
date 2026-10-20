<script setup lang="ts">
import { computed, ref } from "vue";

import { pageStrings } from "@shared/i18n";
import { useGameStore } from "../stores/game";

const store = useGameStore();
const t = pageStrings("contestant/game");

const answer = ref("");

/** Contestants who wagered nothing sit this one out. */
const wagered = computed(() => (store.me?.finale_wager ?? 0) > 0);
</script>

<template>
  <h2 id="question-category-name">{{ store.state?.question?.category.name }}</h2>

  <template v-if="wagered">
    <h3 id="finale-wager-header">
      {{ t("finale_wager_amount") }} <strong>{{ store.me?.finale_wager }}</strong>
      {{ t("points") }}
    </h3>

    <div id="finale-question-wrapper">
      <h3 id="finale-question-header">{{ store.state?.question?.question }}</h3>
      <h4>{{ t("finale_answer") }}</h4>

      <input id="finale-answer" v-model="answer" :disabled="store.wagerAccepted" />
      <button
        id="contestant-wager-btn"
        :class="{ 'wager-made': store.wagerAccepted }"
        :disabled="store.wagerAccepted"
        @click="store.giveFinaleAnswer(answer)"
      >
        OK
      </button>
    </div>
  </template>

  <h4 v-else id="finale-no-wager-header">{{ t("finale_no_wager") }}</h4>
</template>
