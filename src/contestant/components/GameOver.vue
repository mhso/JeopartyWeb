<script setup lang="ts">
import { computed } from "vue";

import { pageStrings } from "@shared/i18n";
import { useGameStore } from "../stores/game";

const store = useGameStore();
const t = pageStrings("contestant/game");

const won = computed(() => store.state?.winner ?? false);
</script>

<template>
  <template v-if="won">
    <h2 class="player-has-turn">{{ t("game_over_winner_header") }}</h2>
    <h3>{{ t("game_over_winner_text") }}</h3>
  </template>

  <template v-else>
    <h2 class="player-lost">{{ t("game_over_loser_header") }}</h2>
    <h3>{{ t("game_over_loser_text") }}</h3>
  </template>
</template>
