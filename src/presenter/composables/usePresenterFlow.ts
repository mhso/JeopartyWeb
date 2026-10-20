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
 * a global.
 *
 * Beat order for a regular question:
 *
 *   idle              presenter has not started; Space reveals the question
 *   questionShown     text is up; Space reveals media (or opens buzzing)
 *   mediaShown        image shown / video playing
 *   choicesRevealed   multiple-choice options revealed one at a time
 *   buzzOpen          contestants may buzz; buzz-in countdown running
 *   answering         someone buzzed; answer countdown running
 *   judged            correct/wrong shown; Ctrl+Z undoes
 *   revealed          answer on screen; Space returns to the board
 *
 * Daily doubles skip buzzOpen (the turn holder answers). The finale replaces
 * buzzOpen with a fixed 40s timer that routes to the finale screen.
 */

import { computed, ref } from "vue";

import { useCountdown } from "@shared/composables/useCountdown";
import type { KeyHandlers } from "@shared/composables/useActionKey";
import type { PowerUpType } from "@shared/types";

export type Beat =
  | "idle"
  | "questionShown"
  | "mediaShown"
  | "choicesRevealed"
  | "buzzOpen"
  | "answering"
  | "judged"
  | "revealed";

/** Timings lifted from the constants at the top of presenter.js. */
export const TIMING = {
  finalAnswerSeconds: 40,
  beforeFirstTipSeconds: 4,
  betweenTipsSeconds: 4,
  rewindGraceSeconds: 4,
  freezeSeconds: 40,
} as const;

export interface FlowCallbacks {
  onOpenBuzzing: () => void;
  onCloseBuzzing: () => void;
  onJudge: (correct: boolean, value: number) => void;
  onUndo: () => void;
  onFinish: () => void;
}

export function usePresenterFlow(callbacks: FlowCallbacks) {
  const beat = ref<Beat>("idle");
  const countdown = useCountdown();

  /** Contestant id currently holding the floor, or null if buzzing is open. */
  const answeringContestant = ref<string | null>(null);
  /** Which contestants may still buzz on this question. */
  const activeContestants = ref<Record<string, boolean>>({});
  /** Power-up mid-animation, if any -- blocks most transitions while set. */
  const activePowerUp = ref<PowerUpType | null>(null);
  /** Hijacking before the question is revealed pays 1.5x. */
  const hijackBonus = ref(false);
  /** Number of tips revealed; each halves the question's value. */
  const tipsShown = ref(0);
  /** Wrong multiple-choice answers eliminated so far. */
  const wrongChoices = ref(0);

  const canBuzz = computed(() => beat.value === "buzzOpen");

  function transition(next: Beat): void {
    beat.value = next;
  }

  /**
   * Value the question is currently worth, after tip and wrong-choice
   * deductions and the hijack bonus. Ports the arithmetic inline in
   * `correctAnswer()`.
   */
  function currentValue(baseValue: number, totalChoices: number): number {
    let value = baseValue * (1 / 2 ** tipsShown.value);
    if (wrongChoices.value > 0 && totalChoices > 0) {
      value -= value * (wrongChoices.value / totalChoices);
    }
    if (hijackBonus.value) value *= 1.5;
    return Math.ceil(value);
  }

  /** Key handlers for the current beat. Feed this to `useActionKey`. */
  const handlers = computed<KeyHandlers>(() => {
    switch (beat.value) {
      case "idle":
        return { onAction: () => transition("questionShown") };

      case "questionShown":
        return { onAction: () => transition("mediaShown") };

      case "mediaShown":
        return { onAction: () => transition("choicesRevealed") };

      case "choicesRevealed":
        return {
          onAction: () => {
            callbacks.onOpenBuzzing();
            transition("buzzOpen");
          },
        };

      case "buzzOpen":
        return {
          // Enter aborts a question nobody wants ("cowards").
          onEnter: () => {
            countdown.stop();
            callbacks.onCloseBuzzing();
            transition("revealed");
          },
        };

      case "answering":
        return {
          // 1 = correct, 2 = wrong; with choices, N selects choice N.
          onDigit: (digit) => callbacks.onJudge(digit === 1, digit),
        };

      case "judged":
        return {
          onUndo: () => {
            callbacks.onUndo();
            transition("answering");
          },
          onAction: () => transition("revealed"),
        };

      case "revealed":
        return { onAction: () => callbacks.onFinish() };
    }
  });

  function reset(): void {
    beat.value = "idle";
    answeringContestant.value = null;
    activeContestants.value = {};
    activePowerUp.value = null;
    hijackBonus.value = false;
    tipsShown.value = 0;
    wrongChoices.value = 0;
    countdown.stop();
  }

  return {
    beat,
    handlers,
    countdown,
    answeringContestant,
    activeContestants,
    activePowerUp,
    hijackBonus,
    tipsShown,
    wrongChoices,
    canBuzz,
    transition,
    currentValue,
    reset,
  };
}
