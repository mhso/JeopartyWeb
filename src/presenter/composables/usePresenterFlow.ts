/**
 * The question-stage state machine.
 *
 * This is the core of the presenter refactor. presenter.js drives a question by
 * reassigning `window.onkeydown` from roughly fifteen call sites -- showQuestion,
 * afterShowQuestion, showAnswerChoice, questionAsked, startAnswerCountdown,
 * pauseBeforeAnswer, answerQuestion, wrongAnswer, afterQuestion... so "what does
 * Space do right now" is only answerable by tracing which closure won the race.
 *
 * Here the beats are named and the key handlers are derived from the current
 * one. Adding a beat means adding a case, not finding every place that rebinds
 * a global. Function names below match their presenter.js counterparts so the
 * two can be read side by side.
 *
 * Beat order for a regular question:
 *
 *   idle            presenter has not started; Space reveals the question
 *   questionShown   text is up, media pending; Space shows the image / plays the video
 *   questionRead    text (and image) up; Space asks the question
 *   videoPlaying    question video running; contestants may buzz to interrupt it
 *   choices         Space reveals the next multiple-choice option
 *   asking          short pause before buzzing opens; no keys
 *   buzzOpen        contestants may buzz; Enter aborts ("no one dares")
 *   buzzed          someone buzzed; 500ms before their answer clock starts
 *   answering       answer countdown running; Space stops it to take the answer
 *   judging         1 = correct, 2 = wrong; with choices, N picks choice N
 *   lockingChoice   2.5s suspense on a picked choice; Ctrl+Z takes it back
 *   wrongShown      wrong answer on screen; Ctrl+Z undoes
 *   over            question finished; Ctrl+Z undoes, Space returns to the board
 *
 * Daily doubles start in `wager` and skip buzzing -- the turn holder answers.
 * The finale replaces buzzing with `finaleCountdown`, a fixed 40s timer that
 * routes to the finale screen.
 *
 * Every timer goes through `later()` so it dies with the view. presenter.js
 * never needed that because each stage was a full page load.
 */

import { computed, nextTick, onScopeDispose, ref, type Ref } from "vue";

import { pageStrings } from "@shared/i18n";
import { useCountdown } from "@shared/composables/useCountdown";
import type { KeyHandlers } from "@shared/composables/useActionKey";
import type { ActiveQuestion, PowerUpType } from "@shared/types";

import { playSound, preloadSounds, SOUNDS, stopSound } from "../audio";
import { useGameStore } from "../stores/game";

export type Beat =
  | "wager"
  | "idle"
  | "questionShown"
  | "questionRead"
  | "videoPlaying"
  | "choices"
  | "asking"
  | "buzzOpen"
  | "buzzed"
  | "answering"
  | "judging"
  | "lockingChoice"
  | "wrongShown"
  | "over"
  | "finaleCountdown";

export type ChoiceState = "answering" | "correct" | "wrong";

/** The freeze overlay on the countdown: fades in, then slowly thaws. */
export type FreezePhase = "off" | "in" | "thawing";

export interface AnswerIndicator {
  correct: boolean;
  /** Why the answer was wrong; unused when correct. */
  reason: string;
  /** "+400 points" / "-400 points", or empty when nobody answered. */
  valueText: string;
}

/** Timings lifted from the constants at the top of presenter.js. */
export const TIMING = {
  finalAnswerSeconds: 40,
  /** Also the wait before the first tip -- presenter.js used 4s for both. */
  betweenTipsSeconds: 4,
  rewindGraceSeconds: 4,
  freezeSeconds: 40,
  freezeFadeInSeconds: 2,
  /** Pause between the last reveal and buzzing opening. */
  askDelayMs: 500,
  /** Pause after a wrong answer before the others may buzz again. */
  afterWrongDelayMs: 4000,
  /** Gap between a buzz and the answer clock starting. */
  buzzToAnswerMs: 500,
  /** Suspense on a picked multiple-choice option. */
  choiceLockMs: 2500,
  /** Gap between the buzzer and the contestant's own buzz sound. */
  personalBuzzDelayMs: 600,
} as const;

export interface FlowOptions {
  /** The question <video>, when the question has one. */
  video: Ref<HTMLVideoElement | null>;
  /** The splash video element for a power-up, if one is rendered. */
  powerUpVideo: (powerId: PowerUpType) => HTMLVideoElement | null;
  /** Leaves the question stage. Called at most once. */
  onFinish: (target: "selection" | "finale") => void | Promise<void>;
}

interface Judgement {
  contestantId: string;
  correct: boolean;
  value: number;
  /** Multiple-choice option that produced this judgement, if any. */
  choiceIndex: number | null;
}

export function usePresenterFlow(question: ActiveQuestion, options: FlowOptions) {
  const store = useGameStore();
  const t = pageStrings("presenter/question");
  const { video } = options;

  const extra = question.extra;
  const choices = extra.choices ?? [];
  const tips = extra.tips ?? [];
  const isFinale = store.stage === "finale_question";
  const isDailyDouble = question.daily_double && !isFinale;
  const buzzTime = question.category.buzz_time ?? 0;
  const answerTime = store.game?.answer_time ?? 6;
  // Daily doubles answer on the category's buzz time, like presenter.js did,
  // but a category without a buzz timer would otherwise expire instantly.
  const dailyDoubleTime = buzzTime > 0 ? buzzTime : answerTime;
  /** presenter.js `canPlayersBuzzIn`. */
  const canBuzz = store.stage === "question" && !isDailyDouble;
  // Without power-ups contestants have no power-up rows, and the server's
  // enable/disable handlers would trip over that.
  const usePowerUps = canBuzz && (store.game?.use_powerups ?? false);

  // -- state ----------------------------------------------------------------

  const beat = ref<Beat>(isDailyDouble ? "wager" : "idle");
  const countdown = useCountdown();

  /** What the question is worth before tip/choice/hijack adjustments. Daily doubles: the wager. */
  const value = ref(question.value);
  /** presenter.js `activeAnswer == null`. */
  const questionOver = ref(false);

  /** Contestant id currently holding the floor. */
  const answering = ref<string | null>(null);
  /** Which contestants may still buzz on this question. */
  const activeContestants = ref<Record<string, boolean>>({});
  /** Buzz winners in order, so `rewind` can refund the ones after it. */
  const buzzedIn = ref<string[]>([]);
  /** Power-up most recently used, if any -- blocks other buzzes while set. */
  const activePowerUp = ref<PowerUpType | null>(null);
  /** Hijacking before the question is revealed pays 1.5x. */
  const hijackBonus = ref(false);

  // Reveal state, replacing the opacity/d-none pokes in presenter.js.
  const questionVisible = ref(false);
  const mediaVisible = ref(false);
  const answerImageVisible = ref(false);
  const answerRevealed = ref(false);
  const choicesShown = ref(0);
  const choiceStates = ref<Record<number, ChoiceState>>({});
  const tipsShown = ref(0);
  const indicator = ref<AnswerIndicator | null>(null);
  /** Set 100ms after `indicator` so its opacity transition runs. */
  const indicatorVisible = ref(false);
  const freeze = ref<FreezePhase>("off");
  const splash = ref<PowerUpType | null>(null);
  const finaleSkippable = ref(false);

  let lastJudgement: Judgement | null = null;
  let wrongSoundsPlayed = 0;
  let finishing = false;

  if (isDailyDouble) {
    answering.value = store.contestantWithTurn?.id ?? null;
    store.spotlight = answering.value;
  }

  preloadSounds([
    SOUNDS.buzzer,
    isFinale ? SOUNDS.suspense : null,
    store.state?.correct_sound,
    ...(store.state?.wrong_sounds ?? []),
    ...store.contestants.map((c) => c.buzz_sound),
  ]);

  // -- timers ---------------------------------------------------------------

  const timers = new Set<number>();

  function later(fn: () => void, ms: number): number {
    const handle = window.setTimeout(() => {
      timers.delete(handle);
      fn();
    }, ms);
    timers.add(handle);
    return handle;
  }

  function cancel(handle: number | null): null {
    if (handle !== null) {
      clearTimeout(handle);
      timers.delete(handle);
    }
    return null;
  }

  let askTimer: number | null = null;
  let answerStartTimer: number | null = null;
  let freezeExpiryTimer: number | null = null;
  let freezeTimers: number[] = [];
  let choiceLockTimer: number | null = null;
  let afterWrongTimer: number | null = null;
  let tipTimer: number | null = null;

  onScopeDispose(() => {
    timers.forEach((handle) => clearTimeout(handle));
    timers.clear();
    stopTips();
    pauseVideo();
  });

  // -- helpers --------------------------------------------------------------

  function enablePowerUp(contestantId: string | null, powerId: PowerUpType): void {
    if (usePowerUps) store.emit.enablePowerUp(contestantId, powerId);
  }

  function disablePowerUp(contestantId: string | null = null, powerId: PowerUpType | null = null): void {
    if (usePowerUps) store.emit.disablePowerUp(contestantId, powerId);
  }

  /** presenter.js `listenForBuzzIn`. */
  function openBuzzing(): void {
    if (Object.keys(activeContestants.value).length) {
      store.emit.enableBuzz(activeContestants.value);
    }
  }

  function pauseVideo(): void {
    const el = video.value;
    if (!el) return;
    el.onended = null;
    if (!el.paused) el.pause();
  }

  function playVideo(onEnded: () => void): void {
    const el = video.value;
    if (!el) return onEnded();
    el.onended = onEnded;
    el.play().catch((err: unknown) => {
      // AbortError just means a buzz paused it before playback began.
      if ((err as DOMException).name === "AbortError") return;
      console.warn("Question video failed to play:", err);
      el.onended = null;
      onEnded();
    });
  }

  function recordsAreEqual(a: Object | null, b: Object | null) {
    if (a == null || b == null) return a == b;
  
    return Object.keys(a).length === Object.keys(b).length &&
    (Object.keys(a) as (keyof typeof a)[]).every((key) => {
      return (
        Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]
      );
    });
  }

  function showIndicator(next: AnswerIndicator): void {
    indicator.value = next;
    indicatorVisible.value = false;
    later(() => {
      if (!recordsAreEqual(indicator.value, next)) return;
      indicatorVisible.value = true;
      if (next.correct) {
        void playSound(store.state?.correct_sound);
      } else {
        // Each wrong answer on a question gets the next sound in the list.
        void playSound(store.state?.wrong_sounds?.[wrongSoundsPlayed]);
        wrongSoundsPlayed += 1;
      }
    }, 100);
  }

  function hideAnswerIndicator(): void {
    indicator.value = null;
    indicatorVisible.value = false;
  }

  function hideFreezeAnimation(): void {
    freezeTimers.forEach(cancel);
    freezeTimers = [];
    freeze.value = "off";
  }

  /**
   * Value the question is currently worth, after tip and wrong-choice
   * deductions and the hijack bonus. Ports the arithmetic in `correctAnswer()`.
   */
  function currentValue(): number {
    let result = value.value * (1 / 2 ** tipsShown.value);
    const wrongChoices = Object.values(choiceStates.value).filter((s) => s === "wrong").length;
    if (wrongChoices > 0 && choices.length > 0) {
      result -= result * (wrongChoices / choices.length);
    }
    if (hijackBonus.value) result *= 1.5;
    return Math.ceil(result);
  }

  async function finish(target: "selection" | "finale"): Promise<void> {
    if (finishing) return;
    finishing = true;
    countdown.stop();
    // Sounds outlive the view now, and the suspense track runs the full 40s.
    stopSound(SOUNDS.suspense);
    await options.onFinish(target);
  }

  // -- 1. media reveal sequence ---------------------------------------------

  /** Space on `idle`. */
  function start(): void {
    showQuestion();
    if (isFinale) later(() => store.emit.enableFinaleAnswer(), 2000);
  }

  function showQuestion(): void {
    if (Object.keys(activeContestants.value).length === 0) {
      activeContestants.value = Object.fromEntries(
        store.contestants.map((c) => [c.id, !isDailyDouble]),
      );
    }

    questionVisible.value = true;

    if (extra.answer_image || extra.video) {
      // Question first, media on the next press.
      beat.value = "questionShown";
      return;
    }

    if (extra.question_image) mediaVisible.value = true;
    if (choices.length) afterShowQuestion();
    else beat.value = "questionRead";
  }

  /** Space on `questionShown`. presenter.js inlined this in showQuestion. */
  function showImageOrVideo(): void {
    mediaVisible.value = true;

    if (extra.question_image) {
      afterShowQuestion();
      return;
    }

    beat.value = "videoPlaying";
    playVideo(afterShowQuestion);

    // Let players interrupt the video and buzz in early.
    if (canBuzz) openBuzzing();
  }

  function afterShowQuestion(): void {
    if (video.value) video.value.onended = null;

    // Also the video's `ended` handler after a wrong answer, by which point the
    // choices are already out.
    if (choicesShown.value < choices.length) beat.value = "choices";
    else questionAsked(TIMING.askDelayMs);
  }

  /** Space on `choices`. */
  function showAnswerChoice(): void {
    choicesShown.value += 1;
    if (choicesShown.value >= choices.length) questionAsked(TIMING.askDelayMs);
  }

  function questionAsked(delayMs: number): void {
    // Keep Ctrl+Z available through the post-wrong-answer pause.
    if (beat.value !== "wrongShown") beat.value = "asking";

    askTimer = cancel(askTimer);
    askTimer = later(() => {
      askTimer = null;
      if (questionOver.value) return;

      if (answering.value === null && canBuzz) {
        beat.value = "buzzOpen";
        hideAnswerIndicator();
        startTips();
        if (buzzTime > 0) {
          countdown.start(buzzTime, () => wrongAnswer(t("wrong_answer_time"), true));
        }
      } else if (isDailyDouble) {
        startAnswerCountdown(dailyDoubleTime);
      } else if (isFinale) {
        beat.value = "finaleCountdown";
        void playSound(SOUNDS.suspense, 0.7);
        countdown.start(TIMING.finalAnswerSeconds, () => void finish("finale"));
        // Allow overriding the countdown once everyone has answered.
        later(() => (finaleSkippable.value = true), 2000);
      }
    }, delayMs);

    if (canBuzz) openBuzzing();
  }

  // -- 2. buzz handling -----------------------------------------------------

  /** `buzz_received`: every buzz, winner or not, goes to the feed. */
  function onBuzzReceived(contestantId: string, seconds: string): void {
    if (buzzedIn.value.includes(contestantId)) return;
    store.addBuzzToFeed(contestantId, seconds);
  }

  /** `buzz_winner`. */
  function playerBuzzedFirst(contestantId: string): void {
    if (questionOver.value) return;
    if (activePowerUp.value !== null && activePowerUp.value !== "hijack") return;

    buzzedIn.value.push(contestantId);

    if (
      !activeContestants.value[contestantId] ||
      (answering.value !== null && activePowerUp.value !== "hijack")
    ) {
      return;
    }

    answering.value = contestantId;
    activeContestants.value[contestantId] = false;

    void playSound(SOUNDS.buzzer);
    const personal = store.contestant(contestantId)?.buzz_sound;
    if (personal) later(() => void playSound(personal), TIMING.personalBuzzDelayMs);

    afterBuzzIn(contestantId);
  }

  function afterBuzzIn(contestantId: string): void {
    pauseVideo();
    countdown.stop();
    askTimer = cancel(askTimer);
    afterWrongTimer = cancel(afterWrongTimer);
    hideAnswerIndicator();
    store.spotlight = contestantId;
    beat.value = "buzzed";

    answerStartTimer = cancel(answerStartTimer);
    answerStartTimer = later(() => {
      answerStartTimer = null;
      startAnswerCountdown(answerTime);
      enablePowerUp(contestantId, "freeze");
    }, TIMING.buzzToAnswerMs);
  }

  function startAnswerCountdown(seconds: number): void {
    beat.value = "answering";
    countdown.start(seconds, () => wrongAnswer(t("wrong_answer_time"), true));

    // Disable 'freeze' one second before time expires.
    freezeExpiryTimer = cancel(freezeExpiryTimer);
    freezeExpiryTimer = later(() => {
      freezeExpiryTimer = null;
      disablePowerUp(answering.value, "freeze");
      hideFreezeAnimation();
    }, (seconds - 1) * 1000);
  }

  /** Space on `answering`: stop the clock and take the answer. */
  function pauseBeforeAnswer(): void {
    disablePowerUp(null, "hijack");
    disablePowerUp(answering.value, "freeze");
    pauseVideo();
    countdown.stop();
    freezeExpiryTimer = cancel(freezeExpiryTimer);
    hideFreezeAnimation();
    beat.value = "judging";
  }

  // -- 3. judging -----------------------------------------------------------

  /** Digit on `judging`. */
  function answerQuestion(digit: number): void {
    if (digit < 1 || digit > Math.max(choices.length, 2)) return;

    if (!choices.length) {
      if (digit === 1) correctAnswer();
      else wrongAnswer(t("wrong_answer_given"), false);
      return;
    }

    const index = digit - 1;
    if (choiceStates.value[index]) return;

    choiceStates.value[index] = "answering";
    beat.value = "lockingChoice";

    choiceLockTimer = later(() => {
      choiceLockTimer = null;
      const correct = choices[index] === question.answer;
      choiceStates.value[index] = correct ? "correct" : "wrong";
      if (correct) correctAnswer(index);
      else wrongAnswer(t("wrong_answer_given"), false, index);
    }, TIMING.choiceLockMs);
  }

  /** Ctrl+Z on `lockingChoice`. */
  function cancelChoice(): void {
    choiceLockTimer = cancel(choiceLockTimer);
    for (const [index, state] of Object.entries(choiceStates.value)) {
      if (state === "answering") delete choiceStates.value[Number(index)];
    }
    beat.value = "judging";
  }

  function correctAnswer(choiceIndex: number | null = null): void {
    const contestantId = answering.value;
    if (contestantId === null) return;

    disablePowerUp();
    activePowerUp.value = null;

    const awarded = currentValue();
    answerImageVisible.value = true;
    showIndicator({ correct: true, reason: "", valueText: `+${awarded} ${t("points")}` });

    store.adjustStats(contestantId, { score: awarded, hits: 1 });
    store.setTurn(contestantId);
    store.emit.correctAnswer(contestantId, awarded);
    lastJudgement = { contestantId, correct: true, value: awarded, choiceIndex };

    afterQuestion();
    afterAnswer();
    // Unlike presenter.js, leave the new turn holder lit up.
    store.spotlight = undefined;
  }

  function revealAnswer(): void {
    answerImageVisible.value = true;
    answerRevealed.value = true;
    afterQuestion();
  }

  /**
   * @param questionOverFlag the question ended for everyone (time ran out or
   *   nobody dared), rather than just this contestant's attempt.
   */
  function wrongAnswer(reason: string, questionOverFlag: boolean, choiceIndex: number | null = null): void {
    const contestantId = answering.value;
    const outOfTime = questionOverFlag && contestantId === null;

    if (outOfTime) {
      disablePowerUp();
      activePowerUp.value = null;
    }

    let valueText = "";
    lastJudgement = null;
    if (contestantId !== null) {
      freezeExpiryTimer = cancel(freezeExpiryTimer);
      hideFreezeAnimation();

      valueText = `-${value.value} ${t("points")}`;
      store.adjustStats(contestantId, { score: -value.value, misses: 1 });
      store.emit.wrongAnswer(contestantId, value.value);
      lastJudgement = { contestantId, correct: false, value: value.value, choiceIndex };

      // Freeze is spent; rewind becomes available.
      activePowerUp.value = null;
      enablePowerUp(contestantId, "rewind");
    }

    showIndicator({ correct: false, reason, valueText });
    beat.value = "wrongShown";

    const allAnswered = Object.values(activeContestants.value).every((active) => !active);
    if (!outOfTime && !allAnswered) {
      afterAnswer();
      return;
    }

    // Nobody left to answer. Give the last contestant a moment to rewind first.
    const canRewind = usePowerUps && contestantId !== null && store.hasUnusedPower(contestantId, "rewind");
    if (outOfTime || !canRewind) {
      revealAnswer();
      afterAnswer();
      return;
    }

    afterWrongTimer = later(() => {
      afterWrongTimer = null;
      if (activePowerUp.value === "rewind") return;
      revealAnswer();
      afterAnswer();
    }, TIMING.rewindGraceSeconds * 1000);
  }

  function afterQuestion(): void {
    disablePowerUp();
    questionOver.value = true;
    stopTips();
    beat.value = "over";
  }

  function afterAnswer(): void {
    answering.value = null;
    store.spotlight = null;
    store.clearFeed();

    if (questionOver.value) {
      if (!isDailyDouble) store.emit.disableBuzz();
      return;
    }

    const el = video.value;
    if (el && !el.ended && mediaVisible.value) {
      // Let the others buzz straight away, and resume the video if nobody does.
      el.onended = afterShowQuestion;
      openBuzzing();

      afterWrongTimer = later(() => {
        afterWrongTimer = null;
        if (answering.value !== null || questionOver.value) return;
        hideAnswerIndicator();
        beat.value = "videoPlaying";
        playVideo(afterShowQuestion);
      }, TIMING.afterWrongDelayMs);
    } else {
      questionAsked(TIMING.afterWrongDelayMs);
    }
  }

  /** Ctrl+Z on `wrongShown` / `over`: hand the floor back to the last answerer. */
  function undoAnswer(): void {
    const last = lastJudgement;
    if (!last) return;
    lastJudgement = null;

    afterWrongTimer = cancel(afterWrongTimer);
    askTimer = cancel(askTimer);
    countdown.stop();

    questionOver.value = false;
    answerRevealed.value = false;
    answerImageVisible.value = false;
    if (last.choiceIndex !== null) delete choiceStates.value[last.choiceIndex];

    // presenter.js: positive refunds a wrong answer, negative claws back a correct one.
    const delta = last.correct ? -last.value : last.value;
    store.emit.undoAnswer(last.contestantId, delta);
    store.adjustStats(last.contestantId, {
      score: delta,
      hits: last.correct ? -1 : 0,
      misses: last.correct ? 0 : -1,
    });

    answering.value = last.contestantId;
    afterBuzzIn(last.contestantId);
  }

  // -- 4. power-ups ---------------------------------------------------------

  /** Plays the full-screen splash; resolves when it ends or fails to start. */
  async function showPowerUpVideo(powerId: PowerUpType): Promise<void> {
    splash.value = powerId;
    await nextTick();

    const el = options.powerUpVideo(powerId);
    if (!el) {
      splash.value = null;
      return;
    }

    el.currentTime = 0;
    try {
      await el.play();
      await new Promise<void>((resolve) => el.addEventListener("ended", () => resolve(), { once: true }));
    } catch (err) {
      console.warn(`Power-up video '${powerId}' failed to play:`, err);
    }
    splash.value = null;
  }

  /** `power_up_used`. */
  async function powerUpUsed(contestantId: string, powerId: PowerUpType): Promise<void> {
    activePowerUp.value = powerId;

    const el = video.value;
    const videoWasPlaying = !!el && !el.paused && !el.ended;
    if (videoWasPlaying) el.pause();

    let after: () => void;
    if (powerId === "freeze") {
      onFreezeUsed();
      after = afterFreezeUsed;
    } else if (powerId === "rewind") {
      onRewindUsed(contestantId);
      after = afterRewindUsed;
    } else {
      onHijackUsed(contestantId);
      after = () => afterHijackUsed(contestantId, videoWasPlaying);
    }

    store.addPowerUseToFeed(contestantId, powerId);
    store.markPowerUsed(contestantId, powerId);

    await showPowerUpVideo(powerId);
    after();
  }

  function onFreezeUsed(): void {
    freezeExpiryTimer = cancel(freezeExpiryTimer);
    countdown.paused.value = true;
  }

  function afterFreezeUsed(): void {
    hideFreezeAnimation();
    freeze.value = "in";

    freezeTimers.push(
      later(() => {
        freeze.value = "thawing";
      }, TIMING.freezeFadeInSeconds * 1000),
      later(() => {
        if (answering.value === null) return;
        freeze.value = "off";
        countdown.paused.value = false;
      }, TIMING.freezeSeconds * 1000),
    );
  }

  function onRewindUsed(contestantId: string): void {
    countdown.stop();

    // Refund what the contestant lost on their last answer.
    const refund = lastJudgement && !lastJudgement.correct ? lastJudgement.value : value.value;
    const target = store.contestant(contestantId);
    if (target) {
      store.emit.editContestant(contestantId, {
        misses: target.misses - 1,
        score: target.score + refund,
      });
      store.adjustStats(contestantId, { score: refund, misses: -1 });
    }
    lastJudgement = null;

    // Anyone who buzzed after the rewinder gets their buzz back.
    const index = buzzedIn.value.indexOf(contestantId);
    if (index >= 0) {
      for (const refunded of buzzedIn.value.slice(index + 1)) {
        activeContestants.value[refunded] = true;
      }
      buzzedIn.value = buzzedIn.value.slice(0, index + 1);
    }

    answering.value = contestantId;
  }

  function afterRewindUsed(): void {
    if (answering.value !== null) afterBuzzIn(answering.value);
  }

  /** presenter.js `isHijackBeforeQuestion`. */
  function questionStillHidden(): boolean {
    if (extra.question_image || extra.video) return !mediaVisible.value;
    return !!question.question && !questionVisible.value;
  }

  function onHijackUsed(contestantId: string): void {
    countdown.paused.value = true;
    hijackBonus.value = questionStillHidden();

    activeContestants.value = Object.fromEntries(
      store.contestants.map((c) => [c.id, c.id === contestantId]),
    );

    if (!hijackBonus.value && answering.value !== null) countdown.stop();
  }

  function afterHijackUsed(contestantId: string, videoWasPlaying: boolean): void {
    if (!hijackBonus.value && answering.value !== null) {
      answering.value = contestantId;
      afterBuzzIn(contestantId);
    } else {
      store.spotlight = contestantId;
      if (videoWasPlaying) void video.value?.play();
    }
    countdown.paused.value = false;
  }

  /**
   * presenter.js `finalizeSetup`: hijack opens once everyone is connected and
   * the hijack splash has buffered, so it can't stall on first use.
   */
  function enableHijackWhenReady(): void {
    if (!usePowerUps) return;
    const el = options.powerUpVideo("hijack");
    if (!el || el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      enablePowerUp(null, "hijack");
    } else {
      el.addEventListener("canplaythrough", () => enablePowerUp(null, "hijack"), { once: true });
    }
  }

  // -- 5. tips --------------------------------------------------------------

  /**
   * Replaces showTip's recursive setTimeout chain, which presenter.js restarted
   * from tip 0 after every wrong answer. One interval, started once, paused
   * while someone is answering.
   */
  function startTips(): void {
    if (tipTimer !== null || tipsShown.value >= tips.length) return;
    tipTimer = window.setInterval(() => {
      if (questionOver.value) return stopTips();
      if (answering.value !== null) return;
      tipsShown.value += 1;
      if (tipsShown.value >= tips.length) stopTips();
    }, TIMING.betweenTipsSeconds * 1000);
  }

  function stopTips(): void {
    if (tipTimer !== null) {
      clearInterval(tipTimer);
      tipTimer = null;
    }
  }

  // -- 6. daily double ------------------------------------------------------

  /** `daily_wager_made`. */
  function afterDailyDoubleWager(amount: number): void {
    if (beat.value !== "wager") return;
    value.value = amount;
    beat.value = "idle";
    showQuestion();
  }

  // -- key handlers ---------------------------------------------------------

  /** Key handlers for the current beat. Feed this to `useActionKey`. */
  const handlers = computed<KeyHandlers>(() => {
    switch (beat.value) {
      case "idle":
        return { onAction: start };

      case "questionShown":
        return { onAction: showImageOrVideo };

      case "questionRead":
        return { onAction: afterShowQuestion };

      case "videoPlaying":
        // Daily doubles have nobody to buzz, so the presenter interrupts.
        return isDailyDouble ? { onAction: pauseBeforeAnswer } : {};

      case "choices":
        return { onAction: showAnswerChoice };

      case "buzzOpen":
        return {
          onEnter: () => {
            countdown.stop();
            wrongAnswer(t("wrong_answer_cowards"), true);
          },
        };

      case "answering":
        return { onAction: pauseBeforeAnswer };

      case "judging":
        return { onDigit: answerQuestion };

      case "lockingChoice":
        return { onUndo: cancelChoice };

      case "wrongShown":
        return { onUndo: undoAnswer };

      case "over":
        return { onUndo: undoAnswer, onAction: () => void finish("selection") };

      case "finaleCountdown":
        return finaleSkippable.value ? { onAction: () => void finish("finale") } : {};

      case "wager":
      case "asking":
      case "buzzed":
        return {};
    }
  });

  return {
    beat,
    handlers,
    countdown,
    value,
    questionOver,
    answering,
    activeContestants,
    activePowerUp,
    hijackBonus,
    questionVisible,
    mediaVisible,
    answerImageVisible,
    answerRevealed,
    choicesShown,
    choiceStates,
    tipsShown,
    indicator,
    indicatorVisible,
    freeze,
    splash,
    isDailyDouble,
    isFinale,
    currentValue,
    onBuzzReceived,
    playerBuzzedFirst,
    powerUpUsed,
    afterDailyDoubleWager,
    enableHijackWhenReady,
  };
}
