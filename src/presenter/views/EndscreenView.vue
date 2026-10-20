<script setup lang="ts">
/**
 * Ports templates/presenter/endscreen.html + startWinnerParty() /
 * startEndscreenAnimation() in presenter.js.
 *
 * PHASE 3 for the party animation (confetti video, music, the strobing colour
 * overlay); the scores table below is complete.
 *
 * Note the winner description is built here rather than server-side. The old
 * `endscreen` route assembled an HTML string in Python, interpolating
 * contestant names straight into <span style="color: ..."> -- user-controlled
 * text in markup. Structured data in, markup out, escaped by Vue.
 */
import { computed, onMounted } from "vue";

import { pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import { useActionKey } from "@shared/composables/useActionKey";

import { useGameStore } from "../stores/game";

defineProps<{ gameId: string }>();

const store = useGameStore();
const { setHandlers } = useActionKey();
const t = pageStrings("presenter/endscreen");

const winners = store.state?.winners || [];

onMounted(() => {
  // TODO(phase-3): confetti video + shooting_star.mp3 + strobing overlay,
  // and a second action press to stop the party.
  setHandlers({});
});
</script>

<template>
  <div id="endscreen-wrapper">
    <div id="logo-wrapper">
      <img
        id="jeopardy-logo"
        :src="staticUrl(store.state?.theme?.logo ?? 'img/logo.webp')"
        alt="Jeoparty"
      />
    </div>

    <p id="endscreen-winner-desc">
      <template v-for="(winner, index) in winners" :key="winner.id">
        <span :style="{ color: winner.color, fontWeight: 800 }">{{ winner.name }}</span>
        <template v-if="index < winners.length - 2">, </template>
        <template v-else-if="index === winners.length - 2"> {{ t("and") }} </template>
      </template>
      {{ winners.length === 1 ? t("winner_flavor_1") : t("winner_flavor_2") }}
    </p>

    <div id="endscreen-avatars-wrapper">
      <div v-for="winner in winners" :key="winner.id" class="endscreen-avatars-entry">
        <img class="endscreen-crown" :src="staticUrl('img/crown.png')" alt="" />
        <img class="endscreen-avatar" :src="staticUrl(winner.avatar)" alt="" />
      </div>
    </div>

    <table id="endscreen-scores-table">
      <tr>
        <th>{{ t("name") }}</th>
        <th>{{ t("score") }}</th>
        <th>{{ t("buzzes") }}</th>
        <th>{{ t("correct") }}</th>
        <th>{{ t("wrong") }}</th>
      </tr>
      <tr v-for="contestant in sorted" :key="contestant.id">
        <td class="endscreen-score-name" :style="{ color: contestant.color }">
          {{ contestant.name }}
        </td>
        <td class="endscreen-score-data">{{ contestant.score }}</td>
        <td class="endscreen-score-data">{{ contestant.buzzes }}</td>
        <td class="endscreen-score-data">{{ contestant.hits }}</td>
        <td class="endscreen-score-data">{{ contestant.misses }}</td>
      </tr>
    </table>
  </div>
</template>
