/**
 * Presenter-side game state and the owner of the socket connection.
 *
 * Split deliberately from `usePresenterFlow`: this store holds what the
 * *server* knows (scores, contestants, stage, the active question), while the
 * flow composable holds which beat of a question we are on. presenter.js mixed
 * the two across a dozen module-level `var`s.
 *
 * The socket is created once, here, and survives every stage change. That is
 * the single biggest behavioural difference from the old frontend, where
 * `goToPage()` closed the socket and the next page opened a fresh one.
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { api } from "@shared/api";
import { setLanguage } from "@shared/i18n";
import { connectPresenter, type PresenterSocket } from "@shared/socket";
import type { Contestant, PowerUpType, PresenterState, StageType } from "@shared/types";

/** Stages the presenter can explicitly advance to. */
export type AdvanceTarget = Extract<StageType, "selection" | "question" | "finale_result" | "ended">;

export const useGameStore = defineStore("presenterGame", () => {
  const state = ref<PresenterState | null>(null);
  const connected = ref(false);
  const contestantsReady = ref(false);
  /** Contestant ids that have locked in a finale wager or answer. */
  const readyContestants = ref(new Set<string>());
  /** Rolling log of buzzes and power-up uses for the on-screen feed. */
  const feed = ref<Array<{ id: string; html: string }>>([]);

  let socket: PresenterSocket | null = null;

  const game = computed(() => state.value?.game ?? null);
  const contestants = computed<Contestant[]>(() => game.value?.game_contestants ?? []);
  const question = computed(() => state.value?.question ?? null);
  const stage = computed<StageType>(() => game.value?.stage ?? "lobby");

  const contestantWithTurn = computed(() => contestants.value.find((c) => c.has_turn) ?? null);

  function apply(next: PresenterState): void {
    state.value = next;
    setLanguage(next.language);
  }

  async function init(gameId: string): Promise<void> {
    // Idempotent read. Also registers the socket.io namespace server-side,
    // which `_request_decorator` used to do on every presenter page load.
    apply(await api.presenterState(gameId));
    if (socket) return;

    socket = connectPresenter(gameId);
    const createdBy = state.value!.game.created_by;

    socket.on("connect", () => {
      connected.value = true;
      socket!.emit("presenter_join", createdBy);
    });
    socket.on("disconnect", () => (connected.value = false));

    socket.on("all_contestants_joined", () => (contestantsReady.value = true));

    socket.on("contestant_joined", (json) => {
      const contestant = JSON.parse(json) as Contestant;
      const existing = contestants.value.findIndex((c) => c.id === contestant.id);
      if (existing >= 0) {
        contestants.value[existing] = contestant;
      } else {
        contestants.value.push(contestant);
      }
    });

    socket.on("contestant_disconnected", (id) => {
      const contestant = contestants.value.find((c) => c.id === id);
      if (contestant) contestant.disconnected = true;
    });

    socket.on("contestant_removed", (id) => {
      if (!game.value) return;
      game.value.game_contestants = contestants.value.filter((c) => c.id !== id);
    });

    socket.on("contestant_ready", (id) => readyContestants.value.add(id));
  }

  /**
   * Advances the game, then returns so the caller can navigate.
   *
   * The POST is what mutates; the route change is cosmetic. In the old design
   * these were the same action, which is why refreshing /selection silently
   * advanced the round.
   */
  async function advance(target: AdvanceTarget): Promise<void> {
    if (!game.value) return;
    apply(await api.advanceStage(game.value.id, target));
    readyContestants.value.clear();
    feed.value = [];
  }

  // -- score bookkeeping ----------------------------------------------------

  function adjustScore(contestantId: string, delta: number, correct: boolean): void {
    const contestant = contestants.value.find((c) => c.id === contestantId);
    if (!contestant) return;
    contestant.score += delta;
    if (correct) contestant.hits += 1;
    else contestant.misses += 1;
  }

  function setTurn(contestantId: string | null): void {
    for (const contestant of contestants.value) {
      contestant.has_turn = contestant.id === contestantId;
    }
  }

  function addToFeed(html: string): void {
    feed.value.push({ id: `${Date.now()}-${feed.value.length}`, html });
  }

  // -- emit wrappers --------------------------------------------------------
  // Thin on purpose: the flow composable decides *when*, the store owns *how*.

  const emit = {
    enableBuzz: (activePlayers: Record<string, boolean>) =>
      socket?.emit("enable_buzz", JSON.stringify(activePlayers)),
    disableBuzz: () => socket?.emit("disable_buzz"),
    enablePowerUp: (contestantId: string | null, powerId: PowerUpType) =>
      socket?.emit("enable_powerup", contestantId, powerId),
    disablePowerUp: (contestantId: string | null = null, powerId: PowerUpType | null = null) =>
      socket?.emit("disable_powerup", contestantId, powerId),
    correctAnswer: (contestantId: string, value: number) =>
      socket?.emit("correct_answer", contestantId, value),
    wrongAnswer: (contestantId: string, value: number) =>
      socket?.emit("wrong_answer", contestantId, value),
    undoAnswer: (contestantId: string, value: number) =>
      socket?.emit("undo_answer", contestantId, value),
    firstTurn: (contestantId: string) => socket?.emit("first_turn", contestantId),
    markQuestionActive: (questionId: string, ack?: () => void) =>
      socket?.emit("mark_question_active", questionId, ack),
    removeContestant: (contestantId: string) => socket?.emit("remove_contestant", contestantId),
    editContestant: (contestantId: string, info: Record<string, unknown>) =>
      socket?.emit("edit_contestant_info", contestantId, JSON.stringify(info)),
    enableFinaleWager: () => socket?.emit("enable_finale_wager"),
    enableFinaleAnswer: () => socket?.emit("enable_finale_answer"),
    finaleCorrect: (contestantId: string, amount: number) =>
      socket?.emit("finale_answer_correct", contestantId, amount),
    finaleWrong: (contestantId: string, amount: number) =>
      socket?.emit("finale_answer_wrong", contestantId, amount),
    finaleUndo: (contestantId: string, amount: number) =>
      socket?.emit("finale_answer_undo", contestantId, amount),
  };

  /** Escape hatch for the flow composable, which needs raw `on` for buzz events. */
  function rawSocket(): PresenterSocket | null {
    return socket;
  }

  function teardown(): void {
    socket?.close();
    socket = null;
    connected.value = false;
  }

  return {
    state,
    game,
    contestants,
    question,
    stage,
    contestantWithTurn,
    connected,
    contestantsReady,
    readyContestants,
    feed,
    init,
    advance,
    adjustScore,
    setTurn,
    addToFeed,
    emit,
    rawSocket,
    teardown,
  };
});
