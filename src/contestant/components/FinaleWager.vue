<script setup lang="ts">
import { computed, ref } from "vue";

import { pageStrings } from "@shared/i18n";
import { useGameStore } from "../stores/game";

const store = useGameStore();
const t = pageStrings("contestant/game");

const amount = ref("");

/** Mirrors `on_make_finale_wager`: min 0, max max(score, 1000). */
const maxWager = computed(() => Math.max(store.me?.score ?? 0, 1000));

/**
 * The input stays disabled until the presenter reveals the category and emits
 * `finale_wager_enabled`.
 */
const enabled = computed(() => store.stage === "finale_wager" && store.connected);
</script>

<template>
  <h2 id="finale-category-header">{{ store.state?.question?.category.name }}</h2>

  <h3>{{ t("finale_wager") }}<br />(Min. 0, max. {{ maxWager }})</h3>

  <input
    id="finale-wager-input"
    v-model="amount"
    class="question-wager-input"
    type="number"
    min="0"
    :max="maxWager"
    :disabled="!enabled || store.wagerAccepted"
  />
  <button
    id="contestant-wager-btn"
    :class="{ 'wager-made': store.wagerAccepted }"
    :disabled="!enabled || store.wagerAccepted"
    @click="store.makeFinaleWager(amount)"
  >
    OK
  </button>

  <p v-if="store.wagerBounds" class="contestant-invalid-wager">
    {{ t("invalid_wager") }} {{ store.wagerBounds[0] }} {{ t("and") }} {{ store.wagerBounds[1] }}
  </p>
</template>
