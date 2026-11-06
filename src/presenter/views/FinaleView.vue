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
import { Contestant } from "@/shared/types";

defineProps<{ gameId: string }>();

const store = useGameStore();
const router = useRouter();
const { setHandlers } = useActionKey();
const t = pageStrings("presenter/finale");

/** -1 = nothing revealed yet. */
const revealIndex = ref(-1);
const revealTeaser = ref(false);
const judged = ref(new Map<string, "correct" | "wrong" | null>());
const revealAnswer = ref(false);

const contestants = computed(() => store.contestants);

function judge(correct: boolean): void {
  const contestant = contestants.value[revealIndex.value];
  if (!contestant) return;
  const amount = contestant.finale_wager ?? 0;
  if (amount === 0) {
    judged.value.set(contestant.id, null);
    return;
  }

  if (correct) store.emit.finaleCorrect(contestant.id, amount);
  else store.emit.finaleWrong(contestant.id, amount);
  judged.value.set(contestant.id, correct ? "correct" : "wrong");
}

async function next(): Promise<void> {
  if (revealIndex.value == -1 && !revealAnswer.value) {
    revealAnswer.value = true;
    return;
  }

  if (revealIndex.value >= contestants.value.length - 1) {
    revealTeaser.value = true;

    setTimeout(async () => {
      await store.advance("ended");
      await router.push({ name: "endscreen", params: { gameId: store.game!.id } });
    }, 2000);

    return;
  }
  revealIndex.value += 1;
}

function answer(contestant: Contestant) {
  return contestant.finale_answer ? `'${contestant.finale_answer}'` : t("nothing");
}

onMounted(() => {
  setHandlers({
    onAction: () => void next(),
    onDigit: (digit) => digit <= 2 && judge(digit === 1),
    onUndo: () => {
      const contestant = contestants.value[revealIndex.value];
      const verdict = contestant && judged.value.get(contestant.id);
      if (!contestant || verdict === undefined) return;

      if (verdict !== null) {
        const amount = contestant.finale_wager ?? 0;
        store.emit.finaleUndo(contestant.id, verdict === "correct" ? -amount : amount);
      }
      judged.value.delete(contestant.id);
    },
  });

  console.debug("on_finale_mounted");
});
</script>

<template>
  <div id="finale-wrapper">
    <h2 id="finale-category-header">{{ store.question?.category.name }}</h2>
    <h3 id="finale-question-header">{{ store.question?.question }}</h3>
    <h4>{{ t("wager_header") }}</h4>

    <table id="finale-wagers-wrapper">
      <tr v-for="contestant in contestants" :key="contestant.id" class="finale-wager-entry">
        <td class="finale-wager-name" :style="{ fontWeight: 800, color: contestant.color }">
          {{ contestant.name }}</td
        >
        <td class="finale-wager-amount">
          {{ contestant.finale_wager || t("nothing") }}
        </td>
      </tr>
    </table>

    <h3 id="finale-answer" :style="{ opacity: revealAnswer ? 1 : 0 }">
      {{ t("answer_header") }} <span id="finale-answer-text">{{ store.question?.answer }}</span>
    </h3>

    <div id="finale-results-wrapper" :style="{ opacity: revealIndex == -1 ? 0 : 1 }">
      <ul>
        <li
          v-for="(contestant, index) in contestants"
          :key="contestant.id"
          class="finale-result-name"
          :style="{ opacity: index <= revealIndex ? 1 : 0 }"
        >
          <span style="font-weight: 800" :style="{ color: contestant.color }">{{ contestant.name }}</span>
          {{ t("player_answer") }}
          <strong>{{ answer(contestant) }}</strong>
          <span
            v-if="index <= revealIndex && judged.has(contestant.id)"
            class="finale-result-desc"
            :class="{
              'wager-answer-correct': judged.get(contestant.id) === 'correct',
              'wager-answer-wrong': judged.get(contestant.id) === 'wrong',
            }"
          >&nbsp;{{ contestant.finale_wager ? t("and") : t("answer_skipped") }}
            <strong v-if="contestant.finale_wager">{{ t(`answer_${judged.get(contestant.id)}`) }}&nbsp;{{ contestant.finale_wager }}&nbsp;{{  t("points") }}!</strong>
          </span>
        </li>
      </ul>
    </div>
  </div>

  <p id="endscreen-teaser" :style="{ opacity: revealTeaser ? 1 : 0 }">{{ t("endscreen_teaser") }}</p>
</template>

<style scoped>
#finale-wrapper {
  text-align: center;
  color: white;
}

.wager-answer-correct {
  color: rgb(31, 187, 31) !important;
}

.wager-answer-wrong {
  color: rgb(221, 17, 17) !important;

}

#finale-category-header {
  font-size: 3.5rem;
  color: gold;
  text-shadow: 2px 2px 5px rgb(15, 15, 15);
  margin-bottom: 0.5rem;
}

#finale-question-header {
  font-style: italic;
}

#finale-wrapper > h4 {
  font-size: 24px;
  text-decoration: underline;
  margin-bottom: 20px;
}

#finale-wagers-wrapper {
  margin: 0 auto;
  border: 1px solid white;
  text-align: center;
  background-color: #000000d6;
  padding: 10px 20px;
}

#finale-results-wrapper {
  width: 550px;
  margin: 0 auto;
  text-align: left;
  background-color: #000000d6;
  border: 1px solid white;
  transition: opacity 2s;
}

.finale-wager-entry {
  width: 100%;
  text-align: left;
  margin-bottom: 10px;
  margin-top: 10px;
}

.finale-wager-entry .finale-wager-name {
  font-size: 20px;
}

.finale-wager-entry .finale-wager-amount {
  width: 100px;
  float: right;
  text-align: right;
  font-size: 20px;
  font-weight: 800;
}

#finale-answer {
  margin-top: 30px;
  font-size: 3rem;
  text-shadow: 2px 2px 5px rgb(15, 15, 15);
}

#finale-answer-text {
  text-decoration: underline;
  font-weight: 1000;
}

#finale-answer, .finale-result-name, .finale-result-desc, #endscreen-teaser {
  color: white;
  transition: opacity 2s;
  text-shadow: 2px 2px 5px rgb(15, 15, 15);
}

.finale-result-name {
  padding-left: 30px;
}

#endscreen-teaser {
  margin-top: 15px;
  font-size: 30px;
}
</style>
