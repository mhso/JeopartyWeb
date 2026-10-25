<script setup lang="ts">
/**
 * Ports templates/presenter/question.html + question_view.html (non-editable
 * branch) + the question half of presenter.js.
 *
 * The flow composable owns the beats, timers and socket reactions;
 * `useActionKey` binds whatever handlers the current beat exposes; the store
 * owns everything the server knows. This file is the template plus wiring.
 *
 * The question is snapshotted on setup. The store's copy goes null the moment
 * we advance, but this view should keep rendering it until the route changes.
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import { pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import { useActionKey } from "@shared/composables/useActionKey";
import type { PowerUpType } from "@shared/types";

import CountdownBar from "../components/CountdownBar.vue";
import GameFeed from "../components/GameFeed.vue";
import { usePresenterFlow } from "../composables/usePresenterFlow";
import { useGameStore } from "../stores/game";

defineProps<{ gameId: string }>();

const store = useGameStore();
const router = useRouter();
const { setHandlers } = useActionKey();
const t = pageStrings("presenter/question");

const question = store.question;
const extra = question?.extra ?? {};
const choices = extra.choices ?? [];
const tips = extra.tips ?? [];
const LETTERS = "ABCDEFGH";

const videoEl = ref<HTMLVideoElement | null>(null);
const splashVideos: Partial<Record<PowerUpType, HTMLVideoElement>> = {};

function setSplashVideo(powerId: PowerUpType, el: unknown): void {
  if (el instanceof HTMLVideoElement) {
    el.volume = 0.7;
    splashVideos[powerId] = el;
  } else {
    delete splashVideos[powerId];
  }
}

const flow = question
  ? usePresenterFlow(question, {
      video: videoEl,
      powerUpVideo: (powerId) => splashVideos[powerId] ?? null,
      onFinish: async (target) => {
        await store.advance(target === "finale" ? "finale_result" : "selection");
        await router.push({ name: target, params: { gameId: store.game!.id } });
      },
    })
  : null;

// -- media layout -----------------------------------------------------------

const hasMedia = Boolean(extra.question_image || extra.video);
const mediaSize = extra.height ?? (choices.length ? "small" : "default");
const mediaStyle = computed(() => {
  const height = store.state?.media_sizes?.[mediaSize];
  return {
    height: height ? `${height}vh` : undefined,
    borderColor: extra.border,
  };
});
const videoType = extra.video?.includes(".mp4") ? "video/mp4" : "video/webm";

/**
 * Maximized media hides the category header and floats the question text over
 * the media. presenter.js moved the <h3> into the image wrapper by hand; here
 * it simply renders in the other slot.
 */
const floatingHeader = computed(() => mediaSize === "maximized" && !!flow?.mediaVisible.value);

// -- header text ------------------------------------------------------------

const showWager = computed(() => !!flow?.isDailyDouble && flow.beat.value === "wager");
const turnHolder = computed(() => store.contestantWithTurn);
const maxWager = computed(() =>
  Math.max(turnHolder.value?.score ?? 0, store.game?.max_value ?? 0),
);

const powerUpVideos = computed(
  () => Object.entries(store.game?.power_up_videos ?? {}) as Array<[PowerUpType, string]>,
);

// -- wiring -----------------------------------------------------------------

if (flow) {
  watch(flow.handlers, (handlers) => setHandlers(handlers), { immediate: true });
}

// Socket listeners are per-view: the socket outlives us, so they must come off.
const onBuzzReceived = (payload: string) => {
  let parsed = JSON.parse(payload);
  flow?.onBuzzReceived(parsed["user_id"], parsed["seconds"]);
}
const onBuzzWinner = (contestantId: string) => flow?.playerBuzzedFirst(contestantId);
const onPowerUpUsed = (payload: string) => {
  let parsed = JSON.parse(payload);
  void flow?.powerUpUsed(parsed["user_id"], parsed["power_id"]);
}
const onDailyWager = (amount: number) => flow?.afterDailyDoubleWager(Number(amount));

onMounted(() => {
  if (!flow) {
    // Landed here on a reload while the game is elsewhere.
    void router.replace({ name: "selection", params: { gameId: store.game!.id } });
    return;
  }

  if (flow.isFinale) {
    // A zero wager has nothing to answer for, so they start out ready.
    for (const contestant of store.contestants) {
      if (contestant.finale_wager === 0) store.readyContestants.add(contestant.id);
    }
  }

  const socket = store.rawSocket();
  socket?.on("buzz_received", onBuzzReceived);
  socket?.on("buzz_winner", onBuzzWinner);
  socket?.on("power_up_used", onPowerUpUsed);
  socket?.on("daily_wager_made", onDailyWager);

  // presenter.js `finalizeSetup`: hijack unlocks once everyone is connected.
  // Usually already true by now -- contestants joined back in the lobby.
  if (store.contestantsJoined) {
    flow.enableHijackWhenReady();
  } else {
    const stop = watch(
      () => store.contestantsJoined,
      (ready) => {
        if (!ready) return;
        stop();
        flow.enableHijackWhenReady();
      },
    );
  }

  console.debug("on_question_mounted");
});

onUnmounted(() => {
  const socket = store.rawSocket();
  socket?.off("buzz_received", onBuzzReceived);
  socket?.off("buzz_winner", onBuzzWinner);
  socket?.off("power_up_used", onPowerUpUsed);
  socket?.off("daily_wager_made", onDailyWager);
});
</script>

<template>
  <template v-if="question && flow">
    <div
      v-if="question.category.bg_image"
      class="bg-fill bg-image"
      :style="{ backgroundImage: `url(${staticUrl(question.category.bg_image)})` }"
    />

    <div id="question-wrapper">
      <div class="question-view-wrapper">
        <h2 v-show="!floatingHeader" class="question-category-header">
          <div>
            <span class="question-category-span">{{ question.category.name }}</span>
            <template v-if="!flow.isFinale">
              <br />
              <span class="question-desc-span">
                <template v-if="question.daily_double && flow.beat.value === 'wager'">
                  {{ t("daily_double") }}
                </template>
                <template v-else>
                  {{ t("for") }}
                  <span class="question-reward-span">{{ flow.value.value }} {{ t("points") }}</span>
                </template>
              </span>
              {{ " " }}
              <img
                v-if="choices.length"
                class="question-choices-indicator"
                :src="staticUrl('img/list.png')"
                alt=""
              />
            </template>
          </div>
        </h2>

        <div v-if="showWager" id="question-wager-wrapper">
          <h3>
            {{ t("daily_double_wager_1") }}
            <span :style="{ color: turnHolder?.color, fontWeight: 800 }">{{ turnHolder?.name }}</span>
            {{ t("daily_double_wager_2") }} (max {{ maxWager }})
          </h3>
        </div>

        <h3
          v-if="question.question && !floatingHeader"
          class="question-question-header"
          :style="{ opacity: flow.questionVisible.value ? 1 : 0 }"
        >
          {{ question.question }}
        </h3>

        <div v-if="hasMedia" class="question-question-image-wrapper">
          <h3
            v-if="question.question && floatingHeader"
            class="question-question-header question-header-floating"
            style="opacity: 1"
          >
            {{ question.question }}
          </h3>

          <template v-if="extra.question_image">
            <img
              class="question-question-image"
              :class="{ 'image-border': extra.border }"
              :src="staticUrl(extra.question_image)"
              :style="{ ...mediaStyle, opacity: flow.mediaVisible.value ? 1 : 0 }"
              alt=""
            />
            <img
              v-if="extra.answer_image"
              class="question-answer-image"
              :class="{ 'image-border': extra.border }"
              :src="staticUrl(extra.answer_image)"
              :style="{ ...mediaStyle, opacity: flow.answerImageVisible.value ? 1 : 0 }"
              alt=""
            />
          </template>

          <video
            v-else-if="extra.video"
            ref="videoEl"
            class="question-question-video"
            :class="{ 'image-border': extra.border }"
            :style="{ ...mediaStyle, opacity: flow.mediaVisible.value ? 1 : 0 }"
            :volume="extra.volume ?? 1"
            preload="auto"
          >
            <source :src="staticUrl(extra.video)" :type="videoType" />
          </video>
        </div>

        <div v-if="choices.length" class="question-choices-wrapper">
          <div
            v-for="(choice, index) in choices"
            :key="choice"
            class="question-choice-entry"
            :class="[
              `question-choice-${index + 1}`,
              {
                'question-answering': flow.choiceStates.value[index] === 'answering',
                'question-answered-correct': flow.choiceStates.value[index] === 'correct',
                'question-answered-wrong': flow.choiceStates.value[index] === 'wrong',
              },
            ]"
            :style="{ opacity: index < flow.choicesShown.value ? 1 : 0 }"
          >
            <p>
              <span class="question-choice-number">{{ LETTERS[index] }}:</span>
              {{ " " }}
              <span class="question-choice-text">{{ choice }}</span>
            </p>
          </div>
        </div>

        <CountdownBar :countdown="flow.countdown" :freeze="flow.freeze.value" />

        <div
          v-for="(tip, index) in tips"
          v-show="!flow.questionOver.value"
          :key="index"
          class="question-tip-wrapper"
          :class="`question-tip-${index + 1}`"
          :style="{ opacity: index < flow.tipsShown.value ? 1 : 0 }"
        >
          <h3 class="question-tip-header">Tip #{{ index + 1 }}</h3>
          <div class="question-tip-content">{{ tip }}</div>
        </div>
      </div>

      <GameFeed />

      <div
        v-if="flow.indicator.value?.correct"
        id="question-answer-correct"
        :style="{ opacity: flow.indicatorVisible.value ? 1 : 0 }"
      >
        <div id="question-correct-reason">
          {{ t("correct_answer") }}<template v-if="extra.explanation"> ({{ extra.explanation }})</template>
          {{ " " }}
          <img class="question-result-avatar" :src="staticUrl(store.state?.correct_image)" alt="" />
          {{ " " }}
          <span class="question-answer-value">{{ flow.indicator.value.valueText }}</span>
        </div>
      </div>

      <div
        v-else-if="flow.indicator.value"
        id="question-answer-wrong"
        :style="{ opacity: flow.indicatorVisible.value ? 1 : 0 }"
      >
        <div id="question-wrong-reason">
          <span id="question-wrong-reason-text">{{ flow.indicator.value.reason }}</span>
          {{ " " }}
          <img class="question-result-avatar" :src="staticUrl(store.state?.wrong_image)" alt="" />
          {{ " " }}
          <span class="question-answer-value">{{ flow.indicator.value.valueText }}</span>
        </div>
        <p v-if="flow.answerRevealed.value" id="question-actual-answer">
          {{ t("correct_answer_was") }}
          <span class="question-emph">
            '{{ question.answer }}'<template v-if="extra.explanation"> ({{ extra.explanation }})</template>
          </span>
        </p>
      </div>
    </div>

    <!-- Kept mounted so the splash videos buffer before anyone needs them. -->
    <div v-show="flow.splash.value" id="question-power-up-splash">
      <video
        v-for="[powerId, src] in powerUpVideos"
        v-show="flow.splash.value === powerId"
        :key="powerId"
        :ref="(el) => setSplashVideo(powerId, el)"
        :src="staticUrl(src)"
        preload="auto"
      />
    </div>
  </template>
</template>
