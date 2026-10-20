<script setup lang="ts">
/**
 * Ports templates/presenter/question.html + question_view.html (non-editable
 * branch) + the bulk of presenter.js.
 *
 * PHASE 3 -- the hardest single piece of the migration, and deliberately left
 * as a skeleton. The wiring below shows the intended shape: the flow composable
 * owns the beats, `useActionKey` binds its handlers, and the store owns
 * everything the server knows.
 *
 * Still to port, roughly in dependency order:
 *
 *  1. Media reveal sequence -- showQuestion / showImageOrVideo /
 *     afterShowQuestion / showAnswerChoice. Note `maximized` media relocates
 *     the question header into the image wrapper (presenter.js:1035); as a
 *     component that's a conditional slot, not a DOM move.
 *  2. Buzz handling -- playerBuzzedFirst, afterBuzzIn, the per-contestant buzz
 *     sounds, and the `activeContestants` bookkeeping through hijack/rewind.
 *  3. Judging -- correctAnswer / wrongAnswer / revealAnswer / undoAnswer,
 *     including the value arithmetic (already in `flow.currentValue`).
 *  4. Power-ups -- showPowerUpVideo plus the three onX/afterX pairs.
 *     `freeze` becomes `flow.countdown.paused = true`; `rewind` refunds via
 *     edit_contestant_info; `hijack` rewrites `activeContestants`.
 *  5. Tips -- showTip's recursive setTimeout chain. A simple interval that
 *     stops at `tipsShown === tips.length` is equivalent and cancellable.
 *  6. Daily double -- the wager overlay, then straight to `answering`.
 *
 * The audio elements should move into an <AudioBank> so playback survives the
 * component; see the autoplay note in API_BLUEPRINT.md.
 */
import { computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";

import { staticUrl } from "@shared/static";
import { useActionKey } from "@shared/composables/useActionKey";

import CountdownBar from "../components/CountdownBar.vue";
import GameFeed from "../components/GameFeed.vue";
import { usePresenterFlow } from "../composables/usePresenterFlow";
import { useGameStore } from "../stores/game";

defineProps<{ gameId: string }>();

const store = useGameStore();
const router = useRouter();
const { setHandlers } = useActionKey();

const question = computed(() => store.question);
const choices = computed(() => question.value?.extra.choices ?? []);

const flow = usePresenterFlow({
  onOpenBuzzing: () => {
    const active = Object.fromEntries(store.contestants.map((c) => [c.id, true]));
    flow.activeContestants.value = active;
    store.emit.enableBuzz(active);
    const buzzTime = question.value?.category.buzz_time ?? 0;
    if (buzzTime > 0) flow.countdown.start(buzzTime);
  },

  onCloseBuzzing: () => store.emit.disableBuzz(),

  onJudge: (correct, digit) => {
    const contestantId = flow.answeringContestant.value;
    if (!contestantId || !question.value) return;

    const value = flow.currentValue(question.value.value, choices.value.length);
    if (correct) {
      store.emit.correctAnswer(contestantId, value);
      store.adjustScore(contestantId, value, true);
      store.setTurn(contestantId);
    } else {
      store.emit.wrongAnswer(contestantId, value);
      store.adjustScore(contestantId, -value, false);
      if (choices.value.length) flow.wrongChoices.value += 1;
      void digit;
    }
    flow.transition("judged");
  },

  onUndo: () => {
    const contestantId = flow.answeringContestant.value;
    if (!contestantId || !question.value) return;
    const value = flow.currentValue(question.value.value, choices.value.length);
    store.emit.undoAnswer(contestantId, value);
    store.adjustScore(contestantId, value, true);
  },

  onFinish: async () => {
    await store.advance("selection");
    await router.push({ name: "selection", params: { gameId: store.game!.id } });
  },
});

// The whole point of the refactor: one binding, re-derived per beat, instead of
// fifteen `window.onkeydown = ...` assignments racing each other.
watch(flow.handlers, (handlers) => setHandlers(handlers), { immediate: true });

onMounted(() => {
  const socket = store.rawSocket();
  if (!socket) return;

  socket.on("buzz_winner", (contestantId) => {
    if (!flow.canBuzz.value) return;
    flow.answeringContestant.value = contestantId;
    flow.activeContestants.value[contestantId] = false;
    flow.countdown.stop();
    flow.transition("answering");
    flow.countdown.start(store.game?.answer_time ?? 6);
  });

  socket.on("buzz_received", ([contestantId, seconds]) => {
    const contestant = store.contestants.find((c) => c.id === contestantId);
    if (contestant) {
      store.addToFeed(
        `<span style="color: ${contestant.color}; font-weight: 800">${contestant.name}</span> buzzed in ${seconds}s`,
      );
    }
  });

  // TODO(phase-3): socket.on("power_up_used", ...) -> splash video + effects.
});
</script>

<template>
  <div id="question-wrapper">
    <div class="question-view-wrapper">
      <h2 class="question-category-header">
        <div>
          <span class="question-category-span">{{ question?.category.name }}</span>
          <br />
          <span class="question-desc-span">
            <template v-if="question?.daily_double">Daily Double!</template>
            <template v-else>
              for <span class="question-reward-span">{{ question?.value }} points</span>
            </template>
          </span>
        </div>
      </h2>

      <h3 v-show="flow.beat.value !== 'idle'" class="question-question-header">
        {{ question?.question }}
      </h3>

      <div v-if="question?.extra.question_image" class="question-question-image-wrapper">
        <img
          v-show="flow.beat.value !== 'idle' && flow.beat.value !== 'questionShown'"
          class="question-question-image"
          :src="staticUrl(question.extra.question_image)"
          alt=""
        />
      </div>

      <div v-if="choices.length" class="question-choices-wrapper">
        <div
          v-for="(choice, index) in choices"
          :key="choice"
          class="question-choice-entry"
          :class="`question-choice-${index + 1}`"
        >
          <p>
            <span class="question-choice-number">{{ "ABCDEFGH"[index] }}:</span>
            <span class="question-choice-text">{{ choice }}</span>
          </p>
        </div>
      </div>

      <CountdownBar :countdown="flow.countdown" />
    </div>

    <GameFeed />
  </div>
</template>
