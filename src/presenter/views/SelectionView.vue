<script setup lang="ts">
/**
 * Ports templates/presenter/selection.html -- the question board, plus the
 * finale category reveal that shares the route.
 *
 * Still to port from presenter.js (Phase 3):
 *   - showFinaleCategory's staged header reveals.
 */
import { computed, onMounted, watch, ref } from "vue";
import { useRouter } from "vue-router";

import { pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import { useActionKey } from "@shared/composables/useActionKey";

import { useGameStore } from "../stores/game";

const props = defineProps<{ gameId: string }>();

const store = useGameStore();
const router = useRouter();
const { setHandlers } = useActionKey();
const t = pageStrings("presenter/selection");

const categories = computed(() => store.state?.round?.categories ?? []);
const isFinale = computed(() => store.stage === "finale_wager");

const zoomDone = ref(false);
const questionActive = ref(false);

async function advance() {
  if (zoomDone.value && questionActive.value) {
    await store.advance("question");
    await router.push({ name: "question", params: { gameId: store.game!.id } });
  }
}

watch([zoomDone, questionActive], advance);

async function pickQuestion(questionId: string, event: MouseEvent): Promise<void> {
  if (document.querySelector(".selection-question-box.zooming") != null) {
    return;
  }

  const el = event.currentTarget as HTMLElement;

  const bbox = el.getBoundingClientRect();
  const distX = (window.innerWidth / 2) - (bbox.x + bbox.width / 2);
  const distY = (window.innerHeight / 2) - (bbox.y + bbox.height / 2);

  el.classList.add("zooming");

  el.animate(
    [{ transform: "none" }, { transform: `translate(${distX}px, ${distY}px) scale(11)` }],
    { duration: 2000, easing: "ease-in", fill: "forwards" },
  ).finished.then(() => {
    zoomDone.value = true;
    el.classList.remove("zooming");
  });

  store.emit.markQuestionActive(questionId, async () => {
    questionActive.value = true;
  });
}

function chooseStartingPlayer() {
  let playerEntries = document.querySelectorAll(".footer-contestant-entry");
  let minIters = 30;
  let maxIters = 40;
  let iters = minIters + (maxIters - minIters) * Math.random();
  let minWait = 25;
  let maxWait = 420;

  function showStartPlayerCandidate(iter: number) {
      let wait = minWait + (maxWait - minWait) * (iter / iters);

      setTimeout(() => {
          let player = iter % playerEntries.length;
          let playerId = store.contestants[player].id;

          store.setTurn(playerId);

          if (iter < iters) {
              showStartPlayerCandidate(iter + 1);
          }
          else {
              store.setTurn(playerId);
              document.querySelectorAll(".selection-question-box").forEach((elem) => {
                  elem.classList.remove("inactive");
              });
              store.emit.firstTurn(playerId);
          }
      }, wait);
  }

  showStartPlayerCandidate(0);
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
  else {
    setHandlers(
      {
        onAction: chooseStartingPlayer,
      }
    )
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
          :class="{ inactive: question.used || store.state?.start_of_game }"
          @click="pickQuestion(question.id, $event)"
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

<style scoped>
.selection-question-box.zooming {
  position: relative;
  z-index: 999;
}
</style>