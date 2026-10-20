<script setup lang="ts">
/**
 * The buzz / power-up ticker shown during a question.
 * Ports addToGameFeed / addBuzzToFeed / addPowerUseToFeed.
 *
 * Entries carry pre-built HTML (a coloured contestant name plus text). That
 * came from locale strings interpolated with contestant names, so keep the
 * builders in the store rather than letting arbitrary strings in here.
 */
import { useGameStore } from "../stores/game";

const store = useGameStore();
</script>

<template>
  <div v-if="store.feed.length" id="question-game-feed">
    <ul>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <li v-for="entry in store.feed" :key="entry.id" v-html="entry.html" />
    </ul>
  </div>
</template>
