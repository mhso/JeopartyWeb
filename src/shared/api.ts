/**
 * Thin fetch wrapper for the JSON API.
 *
 * Both auth mechanisms are cookies -- `jeoparty_token` for the presenter and
 * `jeoparty_contestant_id` for contestants -- and the app is served from the
 * same origin as the backend, so credentials ride along automatically. There is
 * no token to read, store, or attach here, and there shouldn't be: the goal is
 * for those cookies to become HttpOnly.
 */

import type {
  AuthUser,
  ContestantState,
  Game,
  GameSummary,
  ContestantLobbyInfo,
  PackSaveSuccess,
  PresenterState,
  QuestionPack,
  StageType,
  Theme,
} from "./types";

const API_BASE = "/jeoparty/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
    template?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.template = template;
  }

  template: string | undefined;
}

/**
 * Called when any request comes back 401. Each entry point installs its own
 * handler: the dashboard redirects to /login, the contestant app to the join
 * page. Replaces the server-side `redirect_to_login` dance.
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

  if (response.status === 401 && onUnauthorized) {
    onUnauthorized();
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      (isJson && typeof body === "object" && body !== null && "response" in body
        ? String((body as { response: unknown }).response)
        : null) ?? `Request failed with status ${response.status}`;

      const template = (isJson && typeof body === "object" && body !== null && "template" in body
        ? String((body as { template: unknown }).template)
        : null) ?? undefined;
    throw new ApiError(response.status, message, body, template);
  }

  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

export const api = {
  // -- auth -----------------------------------------------------------------
  me: () => get<AuthUser>("/me"),
  login: (user: string, pass: string) => post<AuthUser>("/login", { user, pass }),
  signup: (user: string, pass: string) => post<AuthUser>("/signup", { user, pass }),
  logout: () => post<{ response: string }>("/logout"),

  // -- dashboard ------------------------------------------------------------
  listPacks: () => get<QuestionPack[]>("/packs"),
  getPack: (packId: string) => get<QuestionPack>(`/packs/${packId}`),
  createPack: (form: FormData) => post<QuestionPack>("/packs", form),
  /**
   * Multipart, exactly as today: a `data` field holding the whole pack as JSON
   * plus one part per media file keyed by filename. The existing
   * `_save_pack_files` handler needs no changes.
   */
  savePack: (packId: string, form: FormData) =>
    post<PackSaveSuccess>(`/packs/${packId}/save`, form),
  deletePack: (packId: string) => del<{ response: string }>(`/packs/${packId}`),
  cheatsheet: (packId: string) => get<QuestionPack>(`/packs/${packId}/cheatsheet`),
  /** Server-side proxy for cross-origin media dropped into the editor. */
  fetchResourceUrl: (url: string) => `${API_BASE}/packs/fetch?url=${encodeURIComponent(url)}`,

  listGames: () => get<GameSummary[]>("/games"),
  createGame: (form: FormData) => post<Game>("/games", form),
  deleteGame: (gameId: string) => del<{ response: string }>(`/games/${gameId}`),

  listThemes: () => get<Theme[]>("/themes"),

  // -- presenter ------------------------------------------------------------
  /**
   * Idempotent read. Also lazily registers the socket.io namespace for this
   * game, which `_request_decorator` used to do on every presenter page load.
   */
  presenterState: (gameId: string) => get<PresenterState>(`/game/${gameId}/presenter-state`),
  /**
   * Advances the game and returns the new state.
   *
   * This is the split that makes an SPA possible. Today GET /presenter/<id>/selection
   * marks the previous question used, bumps the round and rolls daily doubles as
   * a side effect -- so hitting refresh silently advances the game. Reads and
   * transitions are separate verbs now.
   */
  advanceStage: (gameId: string, stage: Extract<StageType, "selection" | "question" | "finale_result" | "ended">) =>
    post<PresenterState>(`/game/${gameId}/advance/${stage}`),

  // -- contestant -----------------------------------------------------------
  lobbyInfo: (joinCode: string) => get<ContestantLobbyInfo>(`/lobby/${joinCode}`),
  /** Multipart because of the avatar upload. Sets the contestant cookie. */
  join: (form: FormData) => post<{ game_id: string; contestant_id: string }>("/contestant/join", form),
  contestantState: (gameId: string) => get<ContestantState>(`/game/${gameId}/contestant-state`),
};
