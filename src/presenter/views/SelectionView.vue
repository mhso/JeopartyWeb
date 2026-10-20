<script setup lang="ts">
/**
 * Ports templates/presenter/selection.html -- the question board, plus the
 * finale category reveal that shares the route.
 *
 * Still to port from presenter.js (Phase 3):
 *   - goToQuestion's zoom animation: the tile scales 11x toward screen centre
 *     over 2.5s, then navigates. Now that navigation is client-side this can be
 *     a real <Transition> instead of a setTimeout racing a page load.
 *   - chooseStartingPlayer's slot-machine effect over the footer cards.
 *   - showFinaleCategory's staged header reveals.
 */
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";

import { pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import { useActionKey } from "@shared/composables/useActionKey";

import { useGameStore } from "../stores/game";

defineProps<{ gameId: string }>();

const store = useGameStore();
const router = useRouter();
const { setHandlers } = useActionKey();
const t = pageStrings("presenter/selection");

const categories = computed(() => store.state?.round?.categories ?? []);
const isFinale = computed(() => store.stage === "finale_wager");

async function pickQuestion(questionId: string): Promise<void> {
  // Tell the server which question is live, wait for the ack, then advance.
  // The ack is what the old code used to time its 2.6s zoom against.
  store.emit.markQuestionActive(questionId, async () => {
    await store.advance("question");
    await router.push({ name: "question", params: { gameId: store.game!.id } });
  });
}

onMounted(() => {
  if (isFinale.value) {
    setHandlers({
      onAction: async () => {
        store.emit.enableFinaleWager();
        await store.advance("question");
        await router.push({ name: "question", params: { gameId: store.game!.id } });
      },
    });
  }
  // TODO(phase-3): arrow-key board navigation (tabulateCategorySelection) and
  // Enter to pick, for presenting without a mouse.
});
</script>

<template>
  <div id="selection-wrapper">
    <div id="logo-wrapper">
      <img
        id="jeopardy-logo"
        :src="staticUrl(store.state?.theme?.logo ?? 'img/logo.webp')"
        alt="Jeoparty"
      />
    </div>

    <div v-if="!isFinale" id="selection-categories-wrapper">
      <div v-for="category in categories" :key="category.id" class="selection-category-entry">
        <div class="selection-category-header">
          <span>{{ category.name }}</span>
        </div>

        <div
          v-for="question in category.questions"
          :key="question.id"
          class="selection-question-box"
          :class="{ inactive: store.state?.start_of_game }"
          @click="pickQuestion(question.id)"
        >
          <span>{{ question.value }}</span>
        </div>
      </div>
    </div>

    <div v-else id="selection-finale-wrapper">
      <h1>{{ store.state?.round_name }}</h1>
      <h2 id="selection-finale-header1">{{ t("finale_reveal_1") }}</h2>
      <h2 id="selection-finale-header2">{{ categories[0]?.name }}</h2>
      <h3 id="selection-finale-header3">{{ t("finale_reveal_2") }}</h3>
    </div>
  </div>
</template>
