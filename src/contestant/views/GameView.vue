<script setup lang="ts">
/**
 * Ports templates/contestant/game.html.
 *
 * That template was a 188-line Jinja if/elif tree over `stage`. Here the stage
 * picks a component, and `state_changed` swaps it without a page load.
 */
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";

import { pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import { useWakeLock } from "@shared/composables/useWakeLock";

import { useGameStore } from "../stores/game";
import BuzzerView from "../components/BuzzerView.vue";
import DailyDoubleWager from "../components/DailyDoubleWager.vue";
import FinaleAnswer from "../components/FinaleAnswer.vue";
import FinaleWager from "../components/FinaleWager.vue";
import GameOver from "../components/GameOver.vue";
import SelectionWait from "../components/SelectionWait.vue";
import WaitingForStart from "../components/WaitingForStart.vue";

const props = defineProps<{ gameId: string }>();
const store = useGameStore();
const router = useRouter();
const wakeLock = useWakeLock();
const t = pageStrings("contestant/game");

onMounted(async () => {
  await store.init(props.gameId);
  void wakeLock.request();
  console.debug("on_game_mounted");
});

onUnmounted(() => store.teardown());

watch(
  () => store.kicked,
  (kicked) => kicked && router.replace({ name: "kicked" }),
);

const stageComponent = computed(() => {
  switch (store.stage) {
    case "lobby":
      return WaitingForStart;
    case "ended":
      return GameOver;
    case "question":
      // A daily double is answered by whoever holds the turn, not by buzzing.
      return store.state?.question?.daily_double ? DailyDoubleWager : BuzzerView;
    case "finale_wager":
      return FinaleWager;
    case "finale_question":
      return FinaleAnswer;
    default:
      return SelectionWait;
  }
});

const showRoundHeader = computed(
  () => store.stage !== "lobby" && store.stage !== "ended" && store.state !== null,
);
</script>

<template>
  <div v-if="store.state" id="contestant-game-wrapper">
    <h1 v-if="store.stage !== 'question'">Jeoparty!</h1>

    <div id="contestant-game-header" :style="{ border: `2px solid ${store.me?.color}` }">
      <div>
        <img
          id="contestant-game-avatar"
          :src="staticUrl(store.me?.avatar)"
          :style="{ border: `2px solid ${store.me?.color}` }"
          alt=""
        />
        <div id="contestant-game-name">{{ store.me?.name }}</div>
      </div>

      <div id="contestant-game-info">
        <div id="contestant-game-score" style="font-weight: 800">
          {{ store.me?.score }} {{ t("points") }}
        </div>
        <div id="contestant-game-buzzes">{{ store.me?.buzzes }} buzzes</div>
        <div id="contestant-game-stats">
          <span id="contestant-game-hits">{{ store.me?.hits }}</span> |
          <span id="contestant-game-misses">{{ store.me?.misses }}</span>
        </div>
        <div id="contestant-game-ping" :class="store.pingClass">
          {{ store.ping === null ? "—" : `${store.ping} ms` }}
        </div>
      </div>
    </div>

    <template v-if="showRoundHeader">
      <h2 class="contestant-round-header">
        {{ t("round_header") }} {{ store.state.game.round }}/{{ store.state.game.total_rounds }}
      </h2>
      <h2 v-if="store.stage === 'finale_question'" class="contestant-round-header">
        {{ store.state.round_name }}
      </h2>
      <h2 v-else class="contestant-round-header">
        {{ t("question_header") }} {{ store.state.game.question_num }}/{{
          store.state.num_questions_in_round
        }}
      </h2>
    </template>

    <component :is="stageComponent" />
  </div>
</template>
