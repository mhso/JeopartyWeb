<script setup lang="ts">
import { computed } from "vue";

import { pageStrings } from "@shared/i18n";
import { useGameStore } from "../stores/game";

const store = useGameStore();
const t = pageStrings("contestant/game");

const withTurn = computed(() => store.state?.player_with_turn ?? null);
const isMyTurn = computed(() => store.me?.has_turn ?? false);
</script>

<template>
  <h3 v-if="isMyTurn" id="contestant-turn-desc" class="player-has-turn">
    {{ t("your_turn") }}
  </h3>

  <h3 v-else-if="withTurn" id="contestant-turn-desc">
    {{ t("waiting_turn_1") }} <strong>{{ withTurn.name }}</strong> {{ t("waiting_turn_2") }}
  </h3>

  <!-- Start of game: nobody holds the turn yet, the presenter is still
       spinning the wheel. `turn_chosen` refetches and this resolves. -->
  <h3 v-else id="contestant-turn-desc">{{ t("waiting_turn_3") }}</h3>
</template>
