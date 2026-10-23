/**
 * Mirrors the JSON produced by `Base.dump()` in mhooge_flask/database.py, as
 * shaped by the `extra_fields` properties on each model in
 * jeoparty/api/orm/models.py.
 *
 * Two conventions from the backend that are easy to trip over:
 *
 *  1. `dump(id="game_id")` renames the `id` key. Routes do this so a game and
 *     its nested contestant can be spread into the same dict. The API layer
 *     (see API_BLUEPRINT.md) drops that trick and always returns `id`, because
 *     nesting is free in JSON and the renaming only existed to serve Jinja.
 *
 *  2. Media paths come back *relative to the static folder* -- e.g.
 *     "data/packs/<pack_id>/foo.png", "img/check.png". Always run them through
 *     `staticUrl()` from ./static.ts before putting them in a src attribute.
 */

export type StageType =
  | "lobby"
  | "selection"
  | "question"
  | "finale_wager"
  | "finale_question"
  | "finale_result"
  | "ended";

export type PowerUpType = "hijack" | "freeze" | "rewind";

export type Language = "danish" | "english";

/** Keys of Config.QUESTION_MEDIA_SIZES; values are vh units. */
export type MediaSize = "small" | "default" | "maximized";

// ---------------------------------------------------------------------------
// Question pack
// ---------------------------------------------------------------------------

/**
 * The free-form `extra` JSON column on the questions table. Every field is
 * optional; `_validate_pack_data` in dashboard.py enforces the cross-field
 * rules (a `choices` array must contain the answer, media requires a height).
 */
export interface QuestionExtra {
  question_image?: string;
  answer_image?: string;
  video?: string;
  /** Named size bucket, not a pixel value. Resolved via Config.QUESTION_MEDIA_SIZES. */
  height?: MediaSize;
  /** CSS colour for the media border, e.g. "#ff0000". */
  border?: string;
  /** 0-1, applied to the question video. */
  volume?: number;
  /** Multiple-choice options. Presence of this key is what makes a question multiple-choice. */
  choices?: string[];
  /** Shown one at a time while nobody buzzes; each halves the question's value. */
  tips?: string[];
  /** Appended in parentheses after the answer is revealed. */
  explanation?: string;
}

export interface Question {
  id: string;
  category_id: string;
  question: string;
  answer: string;
  value: number;
  extra: QuestionExtra;
}

export interface QuestionCategory {
  id: string;
  round_id: string;
  name: string;
  order: number;
  /** Seconds contestants get to buzz in. 0 disables the buzz-in countdown. */
  buzz_time: number | null;
  bg_image: string | null;
  questions: Question[];
}

export interface QuestionRound {
  id: string;
  pack_id: string;
  name: string;
  /** 1-indexed. */
  round: number;
  categories: QuestionCategory[];
}

export interface QuestionPack {
  id: string;
  name: string;
  public: boolean;
  include_finale: boolean;
  language: Language;
  theme_id: string | null;
  lobby_music: string | null;
  lobby_volume: number | null;
  created_by: string;
  created_at: string;
  changed_at: string;
  rounds: QuestionRound[];
  /** Added by the dashboard list endpoint only. */
  total_questions?: number;
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

/**
 * Replaces the Jinja theme fragments in app/templates/themes/<id>/*.html.
 *
 * Those fragments contained <style>, <video> and <script>, and were pulled in
 * per stage with `{% include %}`. Vue can't do that -- v-html does not execute
 * scripts -- so themes become declarative. Both existing themes ("Jul" and
 * "LAN") fit this shape; the only script in them set a video's volume and an
 * onended handler, which the "intro" overlay type covers.
 */
interface ThemeOverlayBase {
  /** Which presenter stage this overlay appears on. */
  stage?: StageType;
  /** Relative to the theme's data path; resolve with `themeAssetUrl()`. */
  src?: string;
  loop?: boolean;
  muted?: boolean;
  autoplay?: boolean;
  volume?: number;
  /**
   * For type "intro" only: how long the presenter's next action is blocked
   * while the intro plays (the "Jul" theme uses 39000).
   */
  delayMs?: number;
  /** Only render when the game is at the start of a round/game, or only when not. */
  when?: "start_of_game" | "not_start_of_game";
}

export interface MediaOverlay extends ThemeOverlayBase {
  type: "image" | "audio" | "video" | "intro_audio" | "intro_video";
  class?: string;
  /** Applied verbatim as inline style. */
  css?: Record<string, string | number>;
}

export interface StyleOverlay extends ThemeOverlayBase {
  type: "style";
  /** Selector -> declarations. */
  css?: Record<string, Record<string, string | number>>;
}

export type ThemeOverlay = MediaOverlay | StyleOverlay;

export interface Theme {
  id: string;
  name: string;
  public: boolean;
  language: Language;
  bg_image: string | null;
  logo: string | null;
  overlays: ThemeOverlay[];
  /** Optional raw CSS injected as a <style> tag. No HTML or JS escape hatch. */
  css?: string;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export interface GamePowerUp {
  id: string;
  type: PowerUpType;
  enabled: boolean;
  used: boolean;
  /** Static-relative icon path, theme-aware via `file_or_fallback`. */
  icon: string;
}

/**
 * A GameContestant joined with its Contestant. The backend flattens the
 * contestant's name/colour/avatar onto the game contestant via `extra_fields`,
 * so there is no separate nested object.
 */
export interface Contestant {
  /** The GameContestant id -- this is what socket events address. */
  id: string;
  game_id: string;
  /** The Contestant id -- this is what lives in the browser cookie. */
  contestant_id: string;
  name: string;
  color: string;
  avatar: string | null;
  buzz_sound: string | null;
  bg_image: string | null;
  has_turn: boolean;
  score: number;
  buzzes: number;
  hits: number;
  misses: number;
  finale_wager: number | null;
  finale_answer: string | null;
  joined_at: string;
  disconnected: boolean;
  power_ups: GamePowerUp[];
}

export interface Game {
  id: string;
  pack_id: string;
  title: string;
  join_code: string;
  regular_rounds: number;
  total_rounds: number;
  max_contestants: number;
  answer_time: number;
  use_daily_doubles: boolean;
  use_powerups: boolean;
  stage: StageType;
  round: number;
  /** Present but never sent to contestants. */
  password?: string | null;
  created_by: string;
  started_at: string;
  ended_at: string | null;
  max_value: number;
  question_num: number;
  power_up_videos: Record<PowerUpType, string>;
  game_contestants: Contestant[];
}

/** A question as presented during a game -- Question plus per-game flags. */
export interface ActiveQuestion extends Question {
  category: QuestionCategory;
  daily_double: boolean;
  active: boolean;
  used: boolean;
}

export interface ActiveQuestionCategory extends QuestionCategory {
  questions: ActiveQuestion[]
}

export interface ActiveQuestionRound extends QuestionRound {
  categories: ActiveQuestionCategory[];
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export interface AuthUser {
  user_id: string;
  user_name: string;
}

export interface PresenterLobbyInfo {
  join_url: string;
  lan_mode: boolean;
  lobby_music: string | null;
  lobby_volume: number | null;
}

/** GET /api/game/<id>/presenter-state */
export interface PresenterState {
  game: Game;
  theme: Theme | null;
  round_name: string;
  language: Language;
  /** Null outside the lobby stage */
  lobby_info: PresenterLobbyInfo | null;
  /** Null outside the question/finale_question stages */
  question: ActiveQuestion | null;
  /** Board layout, null outside the selection stage */
  round: ActiveQuestionRound | null;
  start_of_game: boolean;
  /** Game winners, null outside ended stage */
  winners: Pick<Contestant, "id" | "name" | "color" | "avatar">[];
  /** Chosen server-side per question so every client agrees */
  correct_image: string;
  wrong_image: string;
  correct_sound: string;
  wrong_sounds: string[];
  media_sizes: Record<MediaSize, number>;
}

/** GET /api/game/<id>/contestant-state */
export interface ContestantState {
  game: Pick<
    Game,
    "id" | "stage" | "round" | "total_rounds" | "question_num" | "max_value" | "title"
  >;
  me: Contestant;
  /** Only the fields a phone needs -- never the answer. */
  question: Pick<ActiveQuestion, "id" | "value" | "daily_double"> & {
    category: Pick<QuestionCategory, "id" | "name">;
    /** Present only during finale_question, where the phone shows the prompt. */
    question?: string;
  } | null;
  player_with_turn: Pick<Contestant, "id" | "name" | "color"> | null;
  num_questions_in_round: number;
  round_name: string;
  language: Language;
  start_of_game: boolean;
  /** Set once the game has ended. */
  winner?: boolean;
}

/** GET /api/lobby/<join_code> -- public, no auth. */
export interface ContestantLobbyInfo {
  game_id: string;
  join_code: string;
  title: string;
  has_password: boolean;
  language: Language;
  full: boolean;
  ended: boolean;
  /** Populated from the cookie if this browser has joined before. */
  existing?: {
    name: string;
    color: string;
    avatar: string | null;
  };
  default_avatar: string;
}

export interface GameSummary {
  id: string;
  title: string;
  pack: Pick<QuestionPack, "id" | "name">;
  round: number;
  regular_rounds: number;
  question_num: number;
  total_questions: number;
  use_powerups: boolean;
  stage: StageType;
  contestant_count: number;
  max_contestants: number;
  started_at: string;
  ended_at: string | null;
  /** Deep link into the presenter app; absent once the game has ended. */
  resume_path?: string;
}

/** POST /api/packs/<id>/save error shape. */
export interface PackSaveError {
  response: string;
  round_id?: string;
  category_id?: string;
  question_id?: string;
  /**
   * Semantic field name -- "choices", "media", "answer", "question".
   * The Jinja version returned a CSS selector; the component decides now.
   */
  field?: string;
  index?: number
}

export interface PackSaveSuccess {
  response: string;
  /** Maps client-generated temporary ids to the ids the database assigned. */
  ids: Record<string, string>;
}
