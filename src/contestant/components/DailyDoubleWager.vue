<script setup lang="ts">
import { computed, ref } from "vue";

import { pageStrings } from "@shared/i18n";
import { useGameStore } from "../stores/game";

const store = useGameStore();
const t = pageStrings("contestant/game");

const amount = ref("");

/** Mirrors the server-side bounds in `on_make_daily_wager`. */
const maxWager = computed(() =>
  Math.max(store.me?.score ?? 0, store.state?.game.max_value ?? 0),
);
</script>

<template>
  <template v-if="store.me?.has_turn">
    <h3 class="player-has-turn">
      {{ t("daily_double_wager") }}<br />(Min. 100, max. {{ maxWager }})
    </h3>

    <input
      id="daily-wager-input"
      v-model="amount"
      class="question-wager-input"
      type="number"
      min="100"
      :max="maxWager"
    />
    <button
      id="contestant-wager-btn"
      :class="{ 'wager-made': store.wagerAccepted }"
      :disabled="store.wagerAccepted"
      @click="store.makeDailyWager(amount)"
    >
      OK
    </button>

    <p v-if="store.wagerBounds" class="contestant-invalid-wager">
      {{ t("invalid_wager") }} {{ store.wagerBounds[0] }} {{ t("and") }} {{ store.wagerBounds[1] }}
    </p>
  </template>

  <h3 v-else>
    {{ t("waiting_turn_1") }} <strong>{{ store.state?.player_with_turn?.name }}</strong>
    {{ t("waiting_double") }}
  </h3>
</template>
