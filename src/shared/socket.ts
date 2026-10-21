/**
 * Typed socket.io client for the per-game namespace.
 *
 * Every signature below is taken from jeoparty/app/routes/socket.py --
 * `on_*` methods are client-to-server, `self.emit(...)` calls are
 * server-to-client. Typing both directions is worth doing because several
 * events carry *different payloads depending on who receives them*, which is
 * invisible in the current JS:
 *
 *   buzz_winner   -> presenter gets the contestant id; the winner gets nothing
 *   buzz_received -> presenter gets [id, time]; the buzzer gets nothing
 *   power_up_used -> presenter gets [id, power]; the user gets just the power
 *
 * Hence two separate server-event interfaces rather than one shared one.
 */

import { io, type Socket } from "socket.io-client";
import type { EventsMap } from "@socket.io/component-emitter";
import type { PowerUpType } from "./types";

/** JSON-encoded payloads the backend sends as strings via json.dumps. */
type JsonString = string;

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

interface CommonServerEvents {
  /** Broadcast when the presenter moves the game to a new stage. */
  state_changed: () => void;
  contestant_removed: (contestantId: string) => void;
}

export interface PresenterServerEvents extends CommonServerEvents {
  presenter_joined: () => void;
  all_contestants_joined: () => void;
  /** Serialised GameContestant. */
  contestant_joined: (contestant: JsonString) => void;
  contestant_disconnected: (contestantId: string) => void;
  /** [contestantId, secondsTaken] -- seconds is preformatted to 2dp. */
  buzz_received: (payload: [string, string]) => void;
  buzz_winner: (contestantId: string) => void;
  power_up_used: (payload: [string, PowerUpType]) => void;
  /** Emitted when a contestant has locked in a finale wager or answer. */
  contestant_ready: (contestantId: string) => void;
  daily_wager_made: (amount: number) => void;
}

export interface ContestantServerEvents extends CommonServerEvents {
  /** Acknowledges this contestant's own join. */
  contestant_joined: () => void;
  buzz_enabled: () => void;
  buzz_disabled: () => void;
  /** This contestant buzzed first. */
  buzz_winner: () => void;
  /** Someone else buzzed first. */
  buzz_loser: () => void;
  /** Acknowledges this contestant's own buzz reaching the server. */
  buzz_received: () => void;
  power_up_enabled: (powerId: PowerUpType) => void;
  power_ups_disabled: (powerIds: PowerUpType[]) => void;
  power_up_used: (powerId: PowerUpType) => void;
  /** Partial GameContestant -- any of score/hits/misses/powers. */
  contestant_info_changed: (info: JsonString) => void;
  ping_response: (timeSent: number) => void;
  /** Preformatted to 1dp, clamped to 1-999. */
  ping_calculated: (ping: string) => void;
  /** [min, max] */
  invalid_wager: (min: number, max: number) => void;
  daily_wager_made: (amount: number) => void;
  finale_wager_enabled: () => void;
  finale_wager_made: () => void;
  finale_answer_enabled: () => void;
  finale_answer_given: () => void;
  turn_chosen: (contestantId: string) => void;
}

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

export interface PresenterClientEvents {
  presenter_join: (userId: string) => void;
  presenter_join_timeout: () => void;
  stage_ready: () => void;
  contestant_join_timeout: () => void;
  remove_contestant: (contestantId: string) => void;
  mark_question_active: (questionId: string, ack?: () => void) => void;
  /** JSON map of contestantId -> whether they may still buzz this question. */
  enable_buzz: (activePlayers: JsonString) => void;
  disable_buzz: () => void;
  /** null userId targets every contestant. */
  enable_powerup: (contestantId: string | null, powerId: PowerUpType) => void;
  /** null powerId disables all three. */
  disable_powerup: (contestantId: string | null, powerId: PowerUpType | null) => void;
  correct_answer: (contestantId: string, value: number) => void;
  wrong_answer: (contestantId: string, value: number) => void;
  undo_answer: (contestantId: string, value: number) => void;
  first_turn: (contestantId: string) => void;
  edit_contestant_info: (contestantId: string, info: JsonString) => void;
  enable_finale_wager: () => void;
  enable_finale_answer: () => void;
  finale_answer_correct: (contestantId: string, amount: number) => void;
  finale_answer_wrong: (contestantId: string, amount: number) => void;
  finale_answer_undo: (contestantId: string, amount: number) => void;
}

export interface ContestantClientEvents {
  contestant_join: (contestantId: string) => void;
  buzzer_pressed: () => void;
  use_power_up: (powerId: PowerUpType) => void;
  ping_request: (timestamp: number) => void;
  calculate_ping: (sent: number, received: number) => void;
  make_daily_wager: (amount: string) => void;
  make_finale_wager: (amount: string) => void;
  give_finale_answer: (answer: string) => void;
}

export type PresenterSocket = Socket<PresenterServerEvents, PresenterClientEvents>;
export type ContestantSocket = Socket<ContestantServerEvents, ContestantClientEvents>;

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * One socket per game, created once and kept for the lifetime of the app.
 *
 * The old code tore the socket down and rebuilt it on every stage change
 * (`goToPage` closed it, the next page opened a new one) and every contestant
 * did the same on `state_changed` via location.reload(). In an SPA the
 * connection simply stays up, which is most of the reason this migration is
 * worth doing. Own this from a Pinia store, never from a component.
 */
function connect<S extends EventsMap, C extends EventsMap>(gameId: string): Socket<S, C> {
  return io(`/${gameId}`, {
    transports: ["websocket"],
    rememberUpgrade: true,
    timeout: 10000,
  }) as Socket<S, C>;
}

export const connectPresenter = (gameId: string): PresenterSocket =>
  connect<PresenterServerEvents, PresenterClientEvents>(gameId);

export const connectContestant = (gameId: string): ContestantSocket =>
  connect<ContestantServerEvents, ContestantClientEvents>(gameId);
