/**
 * Contestant-side game state, and the single owner of the socket connection.
 *
 * Replaces static/js/contestant_game.js. Two structural changes:
 *
 *  1. The socket is created once here and kept for the life of the app. The old
 *     code reconnected on every stage change, because `state_changed` triggered
 *     window.location.reload().
 *
 *  2. `state_changed` now refetches state instead of reloading the page, so the
 *     buzzer stays mounted and there is no reconnect storm when the presenter
 *     changes screens.
 *
 * Components never call socket.on -- handlers only mutate this store, and the
 * components stay declarative.
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { api } from "@shared/api";
import { setLanguage } from "@shared/i18n";
import { connectContestant, type ContestantSocket } from "@shared/socket";
import type { ContestantState, PowerUpType } from "@shared/types";

/**
 * Replaces four <img> elements toggled with `.d-none` across eight call sites
 * in the original.
 */
export type BuzzerState = "inactive" | "active" | "pressed" | "won" | "lost";

const PING_INTERVAL_MS = 1000;
const BUZZ_RESULT_MS = 1600;

export const useGameStore = defineStore("contestantGame", () => {
  const state = ref<ContestantState | null>(null);
  const connected = ref(false);
  const buzzer = ref<BuzzerState>("inactive");
  const ping = ref<number | null>(null);
  const kicked = ref(false);
  /** Set when a wager is rejected; [min, max]. */
  const wagerBounds = ref<[number, number] | null>(null);
  const wagerAccepted = ref(false);

  let socket: ContestantSocket | null = null;
  let pingTimer: number | null = null;
  let buzzResetTimer: number | null = null;

  const me = computed(() => state.value?.me ?? null);
  const stage = computed(() => state.value?.game.stage ?? "lobby");
  const powerUps = computed(() => me.value?.power_ups ?? []);

  const pingClass = computed(() => {
    if (ping.value === null) return "contestant-low-ping";
    if (ping.value < 50) return "contestant-low-ping";
    if (ping.value < 100) return "contestant-moderate-ping";
    return "contestant-high-ping";
  });

  async function refresh(gameId: string): Promise<void> {
    state.value = await api.contestantState(gameId);
    setLanguage(state.value.language);
    console.debug("on_contestant_refresh");
  }

  async function init(gameId: string): Promise<void> {
    await refresh(gameId);
    if (!state.value) return;

    socket = connectContestant(gameId);
    const myId = state.value.me.id;

    socket.on("connect", () => {
      connected.value = true;
      socket!.emit("contestant_join", myId);
    });

    socket.on("disconnect", () => {
      connected.value = false;
      stopPing();
    });

    socket.on("contestant_joined", () => startPing());

    // Presenter moved to a new stage. Refetch instead of reloading.
    socket.on("state_changed", () => void refresh(gameId));

    // -- buzzer -------------------------------------------------------------
    socket.on("buzz_enabled", () => {
      clearBuzzReset();
      buzzer.value = "active";
    });
    socket.on("buzz_disabled", () => {
      buzzer.value = "inactive";
    });
    socket.on("buzz_winner", () => showBuzzResult("won"));
    socket.on("buzz_loser", () => {
      // Ignore if we already showed a result -- we buzzed and were judged.
      if (buzzer.value === "won" || buzzer.value === "lost") return;
      showBuzzResult("lost");
    });
    socket.on("buzz_received", () => {
      if (state.value) state.value.me.buzzes += 1;
    });

    // -- power-ups ----------------------------------------------------------
    socket.on("power_up_enabled", (powerId) => setPowerEnabled([powerId], true));
    socket.on("power_ups_disabled", (powerIds) => setPowerEnabled(JSON.parse(powerIds), false));
    socket.on("power_up_used", (powerId) => {
      const power = powerUps.value.find((p) => p.type === powerId);
      if (power) {
        power.used = true;
        power.enabled = false;
      }
      if (powerId !== "freeze") buzzer.value = "inactive";
    });

    // -- score / stats ------------------------------------------------------
    socket.on("contestant_info_changed", (json) => {
      const info = JSON.parse(json) as Partial<{
        score: number;
        hits: number;
        misses: number;
        powers: Record<PowerUpType, boolean>;
      }>;
      if (!state.value) return;
      if (info.score !== undefined) state.value.me.score = info.score;
      if (info.hits !== undefined) state.value.me.hits = info.hits;
      if (info.misses !== undefined) state.value.me.misses = info.misses;
      if (info.powers) {
        for (const power of state.value.me.power_ups) {
          const used = info.powers[power.type];
          if (used !== undefined) power.used = used;
        }
      }
    });

    // -- ping ---------------------------------------------------------------
    socket.on("ping_response", (timeSent) => {
      socket!.emit("calculate_ping", timeSent, Date.now());
    });
    socket.on("ping_calculated", (value) => {
      ping.value = Number.parseFloat(value);
    });

    // -- wagers -------------------------------------------------------------
    socket.on("invalid_wager", (payload: string) => {
      let parsed = JSON.parse(payload);
      wagerBounds.value = [parsed["min"], parsed["max"]];
      wagerAccepted.value = false;
    });
    socket.on("daily_wager_made", () => (wagerAccepted.value = true));
    socket.on("finale_wager_made", () => (wagerAccepted.value = true));
    socket.on("finale_answer_given", () => (wagerAccepted.value = true));
    socket.on("finale_wager_enabled", () => void refresh(gameId));
    socket.on("finale_answer_enabled", () => void refresh(gameId));

    socket.on("turn_chosen", () => void refresh(gameId));
    socket.on("contestant_removed", () => {
      kicked.value = true;
      teardown();
    });
  }

  function setPowerEnabled(powerIds: PowerUpType[], enabled: boolean): void {
    for (const power of powerUps.value) {
      if (powerIds.includes(power.type) && !power.used) power.enabled = enabled;
    }
  }

  function showBuzzResult(result: "won" | "lost"): void {
    buzzer.value = result;
    clearBuzzReset();
    buzzResetTimer = window.setTimeout(() => {
      if (buzzer.value === result) buzzer.value = "inactive";
    }, BUZZ_RESULT_MS);
  }

  function clearBuzzReset(): void {
    if (buzzResetTimer !== null) {
      clearTimeout(buzzResetTimer);
      buzzResetTimer = null;
    }
  }

  function startPing(): void {
    stopPing();
    pingTimer = window.setInterval(() => {
      socket?.emit("ping_request", Date.now());
    }, PING_INTERVAL_MS);
  }

  function stopPing(): void {
    if (pingTimer !== null) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  // -- actions --------------------------------------------------------------

  function pressBuzzer(): void {
    if (buzzer.value !== "active" || !me.value) return;
    buzzer.value = "pressed";
    socket?.emit("buzzer_pressed");
  }

  function usePowerUp(powerId: PowerUpType): void {
    const power = powerUps.value.find((p) => p.type === powerId);
    if (!me.value || !power?.enabled || power.used) return;
    socket?.emit("use_power_up", powerId);
  }

  function makeDailyWager(amount: string): void {
    if (me.value) socket?.emit("make_daily_wager", amount);
  }

  function makeFinaleWager(amount: string): void {
    if (me.value) socket?.emit("make_finale_wager", amount);
  }

  function giveFinaleAnswer(answer: string): void {
    if (me.value) socket?.emit("give_finale_answer", answer);
  }

  function teardown(): void {
    stopPing();
    clearBuzzReset();
    socket?.close();
    socket = null;
    connected.value = false;
  }

  return {
    state,
    me,
    stage,
    powerUps,
    connected,
    buzzer,
    ping,
    pingClass,
    kicked,
    wagerBounds,
    wagerAccepted,
    init,
    refresh,
    pressBuzzer,
    usePowerUp,
    makeDailyWager,
    makeFinaleWager,
    giveFinaleAnswer,
    teardown,
  };
});
