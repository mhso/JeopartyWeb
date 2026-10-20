<script setup lang="ts">
/**
 * Ports templates/presenter/finale.html + showFinaleResult() in presenter.js.
 *
 * PHASE 3. The reveal is a per-contestant walk driven by the action key:
 * Space advances to the next contestant, 1/2 marks their answer right/wrong,
 * Ctrl+Z undoes. That maps onto a `revealIndex` ref plus the same handler
 * pattern as the question flow.
 *
 * Note the backend currently preformats each contestant's wager/answer into
 * display strings (including the locale's word for "nothing"). The API returns
 * the raw values instead -- formatting belongs here.
 */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { pageStrings } from "@shared/i18n";
import { useActionKey } from "@shared/composables/useActionKey";

import { useGameStore } from "../stores/game";

defineProps<{ gameId: string }>();

const store = useGameStore();
const router = useRouter();
const { setHandlers } = useActionKey();
const t = pageStrings("presenter/finale");

/** -1 = nothing revealed yet. */
const revealIndex = ref(-1);
const judged = ref(new Map<string, "correct" | "wrong">());

const contestants = computed(() => store.contestants);

function judge(correct: boolean): void {
  const contestant = contestants.value[revealIndex.value];
  if (!contestant) return;
  const amount = contestant.finale_wager ?? 0;
  if (amount === 0) return;

  if (correct) store.emit.finaleCorrect(contestant.id, amount);
  else store.emit.finaleWrong(contestant.id, amount);
  judged.value.set(contestant.id, correct ? "correct" : "wrong");
}

async function next(): Promise<void> {
  if (revealIndex.value >= contestants.value.length - 1) {
    await store.advance("ended");
    await router.push({ name: "endscreen", params: { gameId: store.game!.id } });
    return;
  }
  revealIndex.value += 1;
}

onMounted(() => {
  setHandlers({
    onAction: () => void next(),
    onDigit: (digit) => digit <= 2 && judge(digit === 1),
    onUndo: () => {
      const contestant = contestants.value[revealIndex.value];
      const verdict = contestant && judged.value.get(contestant.id);
      if (!contestant || !verdict) return;
      const amount = contestant.finale_wager ?? 0;
      store.emit.finaleUndo(contestant.id, verdict === "correct" ? -amount : amount);
      judged.value.delete(contestant.id);
    },
  });
});
</script>

<template>
  <div id="finale-wrapper">
    <h2 id="finale-category-header">{{ store.question?.category.name }}</h2>
    <h3 id="finale-question-header">{{ store.question?.question }}</h3>
    <h4>{{ t("wager_header") }}</h4>

    <div id="finale-wagers-wrapper">
      <div v-for="contestant in contestants" :key="contestant.id" class="finale-wager-entry">
        <span class="finale-wager-name" :style="{ fontWeight: 800, color: contestant.color }">
          {{ contestant.name }}</span
        >:
        <div class="finale-wager-amount">
          {{ contestant.finale_wager || t("nothing") }}
        </div>
      </div>
    </div>

    <h3 id="finale-answer">
      {{ t("answer_header") }} <span class="question-emph">'{{ store.question?.answer }}'</span>
    </h3>

    <div id="finale-results-wrapper">
      <ul>
        <li
          v-for="(contestant, index) in contestants"
          :key="contestant.id"
          class="finale-result-name"
          :style="{ opacity: index <= revealIndex ? 1 : 0, color: contestant.color }"
        >
          <span style="font-weight: 800">{{ contestant.name }}</span>
          {{ t("player_answer") }}
          <strong>{{ contestant.finale_answer || t("nothing") }}</strong>
          <span
            class="finale-result-desc"
            :class="{
              'wager-answer-correct': judged.get(contestant.id) === 'correct',
              'wager-answer-wrong': judged.get(contestant.id) === 'wrong',
            }"
          />
        </li>
      </ul>
    </div>
  </div>
</template>
