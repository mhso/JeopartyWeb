<script setup lang="ts">
/**
 * The contestant strip along the bottom.
 *
 * Replaces `addContestantInGame` in presenter.js -- ~140 lines of
 * document.createElement building the same subtree by hand, plus a parallel
 * branch to update it in place when a contestant rejoined. It's a v-for.
 */
import { pageStrings } from "@shared/i18n";
import { useGameStore } from "../stores/game";
import ContestantCard from "./ContestantCard.vue";

const store = useGameStore();
const t = pageStrings("global");
</script>

<template>
  <div id="contestants-footer">
    <div id="footer-contestants">
      <ContestantCard
        v-for="contestant in store.contestants"
        :key="contestant.id"
        :contestant="contestant"
        :points-label="t('points_short')"
      />
    </div>
  </div>
</template>
