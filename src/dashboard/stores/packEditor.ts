/**
 * Replaces the ~1400 lines of DOM<->data plumbing in static/js/question_pack.js:
 * syncQuestionData, syncCategoryData, syncRoundData, syncPackName,
 * syncPackPublic, syncPackFinale, syncPackLanguage, syncPackTheme,
 * syncLobbyVolume, getElementId, getElementIndex, getNextId, sortQuestions...
 *
 * All of that existed to read values back out of the DOM. With `v-model`
 * bound to this reactive tree there is nothing to read back -- the tree *is*
 * the state.
 *
 * The save payload is *not* the tree verbatim, though. `update_question_pack`
 * in api/database.py is unchanged and expects what question_pack.js sent:
 *
 *  - Rows without an `id` key are inserted. Rows with one are updated, so the
 *    client's temporary ids must be stripped, never sent.
 *  - Removed rows stay in the payload flagged `deleted: true`; a row that is
 *    simply absent is left alone in the database. The editor keeps those as
 *    tombstones next to the tree rather than in it.
 *  - New ids come back as a list addressed by *position* in the payload.
 *
 * The last round is always the finale slot, as in the old UI. When the pack has
 * no finale it is hidden and left out of the payload; `GET /packs/<id>`
 * appends an empty placeholder round when there is nothing in that slot.
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { api, ApiError } from "@shared/api";
import { staticUrl } from "@shared/static";
import type {
  PackSaveError,
  PackSaveNewId,
  Question,
  QuestionCategory,
  QuestionPack,
  QuestionRound,
} from "@shared/types";

import { renameForUpload } from "../media";
import { validatePack } from "../packValidation";

/** Client-side id for rows the database has not seen yet. Swapped after save. */
let tempCounter = 0;
const tempId = (): string => `new-${++tempCounter}`;
export const isTempId = (id: string | undefined): boolean => !id || id.startsWith("new-");

export const DEFAULT_BUZZ_TIME = 10;
/** Config.DEFAULT_FINALE_NAME */
const DEFAULT_FINALE_NAME = "Final Jeoparty!";

const MEDIA_KEYS = ["question_image", "video", "answer_image"] as const;

/** Store references for each payload row, so positional ids can be applied after the await. */
interface PayloadRefs {
  round: QuestionRound;
  categories: { category: QuestionCategory; questions: Question[] }[];
}

/** Drops temporary ids so the backend inserts the row instead of looking it up. */
function withoutTempId<T extends { id: string }>(row: T): Omit<T, "id"> | T {
  if (!isTempId(row.id)) return row;
  const { id: _id, ...rest } = row;
  return rest;
}

export const usePackEditorStore = defineStore("packEditor", () => {
  const pack = ref<QuestionPack | null>(null);
  const loading = ref(false);
  const saving = ref(false);

  /** JSON of the tree as last loaded or saved. Undoing an edit by hand clears `dirty` again. */
  const savedSnapshot = ref("");
  const dirty = computed(
    () => pack.value !== null && JSON.stringify(pack.value) !== savedSnapshot.value,
  );

  /**
   * Media staged for upload, keyed by the filename referenced from
   * `question.extra.question_image` / `.video` / `.answer_image`,
   * `category.bg_image` and `pack.lobby_music`. Posted as multipart parts
   * alongside the JSON, which is exactly what `_save_pack_files` expects.
   */
  const media = ref(new Map<string, File>());
  const objectUrls = new Map<string, string>();

  /** Database rows removed in the editor, sent as `deleted: true` on save. */
  const deletedRounds = ref<QuestionRound[]>([]);
  const deletedCategories = ref<{ roundId: string; category: QuestionCategory }[]>([]);
  const deletedQuestions = ref<{ categoryId: string; question: Question }[]>([]);

  /** Set from a failed save so the offending component can highlight itself. */
  const saveError = ref<PackSaveError | null>(null);

  const activeRound = ref(0);

  const rounds = computed<QuestionRound[]>(() => pack.value?.rounds ?? []);
  const finaleSlot = computed<QuestionRound | null>(() => rounds.value.at(-1) ?? null);
  const regularRounds = computed(() => rounds.value.slice(0, -1));

  const finaleRound = computed<QuestionRound | null>(() =>
    pack.value?.include_finale ? finaleSlot.value : null,
  );

  const isFinale = (roundId: string): boolean => finaleSlot.value?.id === roundId;

  /** The finale is worth the largest value on the board, as createQuestionView computed it. */
  const finaleValue = computed(() => {
    let max = 0;
    for (const round of regularRounds.value) {
      for (const category of round.categories) {
        for (const question of category.questions) max = Math.max(max, Number(question.value) || 0);
      }
    }
    return max || 100;
  });

  async function load(packId: string): Promise<void> {
    loading.value = true;
    try {
      const loaded = await api.getPack(packId);

      // The placeholder finale round from the GET shim arrives without an id.
      for (const round of loaded.rounds) round.id ??= tempId();
      if (loaded.rounds.length < 2) {
        loaded.rounds.push(emptyRound(loaded.id, DEFAULT_FINALE_NAME, loaded.rounds.length + 1));
      }

      pack.value = loaded;
      activeRound.value = Math.min(activeRound.value, loaded.rounds.length - 1);
      saveError.value = null;
      resetPending();
      savedSnapshot.value = JSON.stringify(pack.value);
    } finally {
      loading.value = false;
    }
  }

  function resetPending(): void {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
    media.value.clear();
    deletedRounds.value = [];
    deletedCategories.value = [];
    deletedQuestions.value = [];
  }

  function emptyRound(packId: string, name: string, number: number): QuestionRound {
    return { id: tempId(), pack_id: packId, name, round: number, categories: [] };
  }

  function findRound(roundId: string): QuestionRound | undefined {
    return pack.value?.rounds.find((r) => r.id === roundId);
  }

  function findCategory(categoryId: string): QuestionCategory | undefined {
    return pack.value?.rounds.flatMap((r) => r.categories).find((c) => c.id === categoryId);
  }

  function roundOfCategory(categoryId: string): QuestionRound | undefined {
    return pack.value?.rounds.find((r) => r.categories.some((c) => c.id === categoryId));
  }

  // -- rounds ---------------------------------------------------------------

  /** New rounds go before the finale slot. Returns the new round's index. */
  function addRound(): number {
    if (!pack.value) return -1;
    const index = pack.value.rounds.length - 1;
    pack.value.rounds.splice(index, 0, emptyRound(pack.value.id, `Round ${index + 1}`, index + 1));
    renumberRounds();
    activeRound.value = index;
    return index;
  }

  function canDeleteRound(roundId: string): boolean {
    return !isFinale(roundId) && regularRounds.value.length > 1;
  }

  function deleteRound(roundId: string): void {
    if (!pack.value || !canDeleteRound(roundId)) return;
    const round = findRound(roundId)!;

    // The round's rows cascade, so their own tombstones are redundant.
    const categoryIds = new Set(round.categories.map((c) => c.id));
    deletedCategories.value = deletedCategories.value.filter((d) => d.roundId !== roundId);
    deletedQuestions.value = deletedQuestions.value.filter((d) => !categoryIds.has(d.categoryId));
    if (!isTempId(round.id)) deletedRounds.value.push(round);

    pack.value.rounds = pack.value.rounds.filter((r) => r.id !== roundId);
    renumberRounds();
    activeRound.value = Math.min(activeRound.value, pack.value.rounds.length - 1);
  }

  function renumberRounds(): void {
    pack.value?.rounds.forEach((r, index) => (r.round = index + 1));
  }

  // -- categories -----------------------------------------------------------

  /** Returns the new category, or null for a finale that already has one. */
  function addCategory(roundId: string): QuestionCategory | null {
    const round = findRound(roundId);
    if (!round) return null;

    const finale = isFinale(roundId);
    if (finale && round.categories.length > 0) return null;

    const category: QuestionCategory = {
      id: tempId(),
      round_id: round.id,
      name: "",
      order: round.categories.length,
      buzz_time: finale ? 0 : DEFAULT_BUZZ_TIME,
      bg_image: null,
      questions: [],
    };

    if (finale) reviveFinaleCategory(category);

    round.categories.push(category);
    return round.categories.at(-1)!;
  }

  /**
   * `_validate_pack_data` counts the finale's categories and questions
   * *including* deleted ones. Deleting the finale question and writing a new
   * one would fail with "must have exactly one question", so a new finale row
   * takes over the deleted row's id and the save becomes an update.
   */
  function reviveFinaleCategory(category: QuestionCategory): void {
    const roundId = finaleSlot.value?.id;
    const index = deletedCategories.value.findIndex((d) => d.roundId === roundId);
    if (index === -1) return;

    const [{ category: old }] = deletedCategories.value.splice(index, 1);
    category.id = old.id;
    // The old category's questions no longer cascade away with it.
    for (const question of old.questions) {
      if (!isTempId(question.id)) deletedQuestions.value.push({ categoryId: old.id, question });
    }
  }

  function reviveFinaleQuestion(categoryId: string, question: Question): void {
    const index = deletedQuestions.value.findIndex((d) => d.categoryId === categoryId);
    if (index === -1) return;
    question.id = deletedQuestions.value.splice(index, 1)[0].question.id;
  }

  function deleteCategory(roundId: string, categoryId: string): void {
    const round = findRound(roundId);
    const category = round?.categories.find((c) => c.id === categoryId);
    if (!round || !category) return;

    deletedQuestions.value = deletedQuestions.value.filter((d) => d.categoryId !== categoryId);
    if (!isTempId(category.id)) deletedCategories.value.push({ roundId, category });

    round.categories = round.categories.filter((c) => c.id !== categoryId);
    round.categories.forEach((c, index) => (c.order = index));
  }

  /** Copies a round's category *headers* into another round, as the old UI did. */
  function copyCategories(fromRoundId: string, toRoundId: string): void {
    const from = findRound(fromRoundId);
    const to = findRound(toRoundId);
    if (!from || !to) return;
    to.categories = from.categories.map((c, index) => ({
      id: tempId(),
      round_id: to.id,
      name: c.name,
      order: index,
      buzz_time: c.buzz_time,
      bg_image: null,
      questions: [],
    }));
  }

  // -- questions ------------------------------------------------------------

  /**
   * A detached question for the editor to fill in. Nothing is added to the
   * tree until `commitQuestion`, so cancelling leaves no trace.
   */
  function newQuestion(categoryId: string): Question {
    const category = findCategory(categoryId);
    const round = roundOfCategory(categoryId);
    let value = finaleValue.value;

    if (round && !isFinale(round.id)) {
      // First free slot on the board: 100, 200, ... in round one, 200, 400, ... in round two.
      const step = 100 * round.round;
      const used = new Set(category?.questions.map((q) => Number(q.value)));
      value = step;
      while (used.has(value)) value += step;
    }

    return { id: tempId(), category_id: categoryId, question: "", answer: "", value, extra: {} };
  }

  /**
   * Inserts or replaces a question, plus the category-level settings the
   * question editor exposes (the buzz timer and background are per category).
   */
  function commitQuestion(
    categoryId: string,
    question: Question,
    categoryPatch: Pick<QuestionCategory, "buzz_time" | "bg_image">,
  ): void {
    const category = findCategory(categoryId);
    const round = roundOfCategory(categoryId);
    if (!category || !round) return;

    Object.assign(category, categoryPatch);

    const index = category.questions.findIndex((q) => q.id === question.id);
    if (index === -1) {
      if (isFinale(round.id)) reviveFinaleQuestion(categoryId, question);
      category.questions.push(question);
    } else {
      category.questions[index] = question;
    }
    sortQuestions(categoryId);
  }

  function deleteQuestion(categoryId: string, questionId: string): void {
    const category = findCategory(categoryId);
    const question = category?.questions.find((q) => q.id === questionId);
    if (!category || !question) return;

    if (!isTempId(question.id)) deletedQuestions.value.push({ categoryId, question });
    category.questions = category.questions.filter((q) => q.id !== questionId);
  }

  /**
   * Drag-and-drop on the board. The value slots stay where they are and the
   * questions move between them, which is what questionDragDrop's value
   * shuffling amounted to.
   */
  function moveQuestion(categoryId: string, from: number, to: number): void {
    const category = findCategory(categoryId);
    if (!category || from === to) return;

    const values = category.questions.map((q) => q.value);
    const [moved] = category.questions.splice(from, 1);
    category.questions.splice(to, 0, moved);
    category.questions.forEach((q, index) => (q.value = values[index]));
  }

  /** The board is ordered by value; the old code re-sorted after every edit. */
  function sortQuestions(categoryId: string): void {
    findCategory(categoryId)?.questions.sort((a, b) => a.value - b.value);
  }

  // -- media ----------------------------------------------------------------

  /** Stages a file under a fresh random name and returns that name, or null for an unknown type. */
  function stageMedia(file: File): string | null {
    const renamed = renameForUpload(file);
    if (!renamed) return null;
    media.value.set(renamed.name, renamed);
    return renamed.name;
  }

  function unstageMedia(filename: string): void {
    media.value.delete(filename);
    const url = objectUrls.get(filename);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(filename);
  }

  /** Resolves a media reference: a staged file's object URL, or a static path from the server. */
  function mediaUrl(path: string | null | undefined): string | undefined {
    if (!path) return undefined;
    const file = media.value.get(path);
    if (!file) return staticUrl(path);

    let url = objectUrls.get(path);
    if (!url) {
      url = URL.createObjectURL(file);
      objectUrls.set(path, url);
    }
    return url;
  }

  // -- save -----------------------------------------------------------------

  function buildPayload(source: QuestionPack): {
    payload: Record<string, unknown>;
    refs: PayloadRefs[];
    filenames: Set<string>;
  } {
    const finaleId = finaleSlot.value?.id;
    const refs: PayloadRefs[] = [];
    const filenames = new Set<string>();
    const reference = (name: string | null | undefined) => name && filenames.add(name);

    const payloadRounds: unknown[] = [];
    for (const round of source.rounds) {
      // A hidden finale slot is neither created nor deleted, just left alone.
      if (round.id === finaleId && !source.include_finale) continue;

      const roundRefs: PayloadRefs = { round, categories: [] };
      const categories: unknown[] = [];

      round.categories.forEach((category, order) => {
        reference(category.bg_image);
        const questions: unknown[] = category.questions.map((question) => {
          for (const key of MEDIA_KEYS) reference(question.extra[key]);
          const value = round.id === finaleId ? finaleValue.value : Number(question.value);
          return { ...withoutTempId(question), value };
        });

        for (const { categoryId, question } of deletedQuestions.value) {
          if (categoryId === category.id) questions.push({ ...question, deleted: true });
        }

        roundRefs.categories.push({ category, questions: category.questions.slice() });
        categories.push({ ...withoutTempId(category), order, questions });
      });

      for (const { roundId, category } of deletedCategories.value) {
        if (roundId === round.id) categories.push({ ...category, questions: [], deleted: true });
      }

      refs.push(roundRefs);
      payloadRounds.push({ ...withoutTempId(round), categories });
    }

    // After the live rounds, so the positions the backend reports still line up with `refs`.
    for (const round of deletedRounds.value) {
      payloadRounds.push({ ...round, categories: [], deleted: true });
    }

    reference(source.lobby_music);

    return { payload: { ...source, rounds: payloadRounds }, refs, filenames };
  }

  async function save(): Promise<boolean> {
    if (!pack.value || saving.value) return false;
    const current = pack.value;

    saveError.value = validatePack(current, finaleSlot.value?.id ?? null);
    if (saveError.value) return false;

    if (finaleSlot.value) {
      for (const category of finaleSlot.value.categories) {
        for (const question of category.questions) question.value = finaleValue.value;
      }
    }

    saving.value = true;
    const { payload, refs, filenames } = buildPayload(current);

    const form = new FormData();
    form.append("data", JSON.stringify(payload));
    for (const [filename, file] of media.value) {
      if (filenames.has(filename)) form.append(filename, file);
    }

    try {
      const result = await api.savePack(current.id, form);
      applyNewIds(result.ids, refs);
      resolveStagedPaths(current);
      resetPending();
      savedSnapshot.value = JSON.stringify(current);
      return true;
    } catch (err) {
      saveError.value = describeSaveError(err);
      return false;
    } finally {
      saving.value = false;
    }
  }

  function describeSaveError(err: unknown): PackSaveError {
    if (err instanceof ApiError) {
      if (err.status === 413) {
        return {
          response: "Your question pack is too large, max size is 100 MB. Compress images / videos and try again.",
        };
      }
      if (err.status === 404) {
        return {
          response: "The question pack was not found on the server or you do not have access to it.",
        };
      }
      if (err.body && typeof err.body === "object" && "response" in err.body) {
        return err.body as PackSaveError;
      }
    }
    return { response: "An unknown error occurred, try again later." };
  }

  /** Writes the ids `update_question_pack` assigned back onto the rows that were sent. */
  function applyNewIds(ids: PackSaveNewId[], refs: PayloadRefs[]): void {
    for (const entry of ids) {
      const roundRef = refs[entry.round];
      if (!roundRef) continue;

      if (entry.category === undefined) {
        roundRef.round.id = entry.id;
        for (const { category } of roundRef.categories) category.round_id = entry.id;
        continue;
      }

      const categoryRef = roundRef.categories[entry.category];
      if (!categoryRef) continue;

      if (entry.question === undefined) {
        categoryRef.category.id = entry.id;
        categoryRef.category.round_id = entry.round_id ?? categoryRef.category.round_id;
        for (const question of categoryRef.questions) question.category_id = entry.id;
        continue;
      }

      const question = categoryRef.questions[entry.question];
      if (!question) continue;
      question.id = entry.id;
      question.category_id = entry.category_id ?? question.category_id;
    }
  }

  /**
   * Uploaded files are referenced by bare filename until saved; the server
   * stores them under the pack's data folder and dumps them with that prefix.
   */
  function resolveStagedPaths(target: QuestionPack): void {
    const resolve = (name: string) =>
      media.value.has(name) ? `data/packs/${target.id}/${name}` : name;

    if (target.lobby_music) target.lobby_music = resolve(target.lobby_music);
    for (const round of target.rounds) {
      for (const category of round.categories) {
        if (category.bg_image) category.bg_image = resolve(category.bg_image);
        for (const question of category.questions) {
          for (const key of MEDIA_KEYS) {
            const name = question.extra[key];
            if (name) question.extra[key] = resolve(name);
          }
        }
      }
    }
  }

  return {
    pack,
    rounds,
    regularRounds,
    finaleSlot,
    finaleRound,
    finaleValue,
    activeRound,
    loading,
    saving,
    dirty,
    media,
    saveError,
    isFinale,
    load,
    addRound,
    canDeleteRound,
    deleteRound,
    addCategory,
    deleteCategory,
    copyCategories,
    findCategory,
    roundOfCategory,
    newQuestion,
    commitQuestion,
    deleteQuestion,
    moveQuestion,
    sortQuestions,
    stageMedia,
    unstageMedia,
    mediaUrl,
    save,
  };
});
