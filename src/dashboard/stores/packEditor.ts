/**
 * Replaces the ~1400 lines of DOM<->data plumbing in static/js/question_pack.js:
 * syncQuestionData, syncCategoryData, syncRoundData, syncPackName,
 * syncPackPublic, syncPackFinale, syncPackLanguage, syncPackTheme,
 * syncLobbyVolume, getElementId, getElementIndex, getNextId, sortQuestions...
 *
 * All of that existed to read values back out of the DOM. With `v-model`
 * bound to this reactive tree there is nothing to read back -- the tree *is*
 * the state, and the save payload is the same object it always was.
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { api, ApiError } from "@shared/api";
import type {
  PackSaveError,
  Question,
  QuestionCategory,
  QuestionPack,
  QuestionRound,
} from "@shared/types";

/** Client-side id for rows the database has not seen yet. Swapped after save. */
let tempCounter = 0;
const tempId = (): string => `new-${++tempCounter}`;
export const isTempId = (id: string): boolean => id.startsWith("new-");

const DEFAULT_BUZZ_TIME = 10;

export const usePackEditorStore = defineStore("packEditor", () => {
  const pack = ref<QuestionPack | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const dirty = ref(false);

  /**
   * Media staged for upload, keyed by the filename referenced from
   * `question.extra.question_image` / `.video` / `.answer_image` and
   * `category.bg_image`. Posted as multipart parts alongside the JSON, which
   * is exactly what `_save_pack_files` already expects.
   */
  const media = ref(new Map<string, File>());

  /** Set from a failed save so the offending component can highlight itself. */
  const saveError = ref<PackSaveError | null>(null);

  const activeRound = ref(0);

  const rounds = computed<QuestionRound[]>(() => pack.value?.rounds ?? []);

  const finaleRound = computed<QuestionRound | null>(() => {
    if (!pack.value?.include_finale) return null;
    return pack.value.rounds.at(-1) ?? null;
  });

  async function load(packId: string): Promise<void> {
    loading.value = true;
    try {
      pack.value = await api.getPack(packId);
      dirty.value = false;
      media.value.clear();
    } finally {
      loading.value = false;
    }
  }

  function markDirty(): void {
    dirty.value = true;
  }

  // -- mutations ------------------------------------------------------------

  function addRound(): void {
    if (!pack.value) return;
    const number = pack.value.rounds.length + 1;
    pack.value.rounds.push({
      id: tempId(),
      pack_id: pack.value.id,
      name: `Round ${number}`,
      round: number,
      categories: [],
    });
    markDirty();
  }

  function deleteRound(roundId: string): void {
    if (!pack.value) return;
    pack.value.rounds = pack.value.rounds.filter((r) => r.id !== roundId);
    pack.value.rounds.forEach((r, index) => (r.round = index + 1));
    activeRound.value = Math.min(activeRound.value, pack.value.rounds.length - 1);
    markDirty();
  }

  function addCategory(roundId: string): void {
    const round = pack.value?.rounds.find((r) => r.id === roundId);
    if (!round) return;
    round.categories.push({
      id: tempId(),
      round_id: round.id,
      name: "",
      order: round.categories.length,
      buzz_time: DEFAULT_BUZZ_TIME,
      bg_image: null,
      questions: [],
    });
    markDirty();
  }

  function deleteCategory(roundId: string, categoryId: string): void {
    const round = pack.value?.rounds.find((r) => r.id === roundId);
    if (!round) return;
    round.categories = round.categories.filter((c) => c.id !== categoryId);
    round.categories.forEach((c, index) => (c.order = index));
    markDirty();
  }

  /** Copies a round's category *headers* into the next round, as the old UI did. */
  function copyCategories(fromRoundId: string, toRoundId: string): void {
    const from = pack.value?.rounds.find((r) => r.id === fromRoundId);
    const to = pack.value?.rounds.find((r) => r.id === toRoundId);
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
    markDirty();
  }

  function addQuestion(categoryId: string): Question | null {
    const category = findCategory(categoryId);
    if (!category) return null;
    // Values step by the round number, matching the board layout.
    const round = pack.value?.rounds.find((r) => r.categories.includes(category));
    const step = 100 * (round?.round ?? 1);
    const question: Question = {
      id: tempId(),
      category_id: category.id,
      question: "",
      answer: "",
      value: (category.questions.length + 1) * step,
      extra: {},
    };
    category.questions.push(question);
    markDirty();
    return question;
  }

  function deleteQuestion(categoryId: string, questionId: string): void {
    const category = findCategory(categoryId);
    if (!category) return;
    category.questions = category.questions.filter((q) => q.id !== questionId);
    markDirty();
  }

  /** The board is ordered by value; the old code re-sorted after every edit. */
  function sortQuestions(categoryId: string): void {
    findCategory(categoryId)?.questions.sort((a, b) => a.value - b.value);
  }

  function findCategory(categoryId: string): QuestionCategory | undefined {
    return pack.value?.rounds.flatMap((r) => r.categories).find((c) => c.id === categoryId);
  }

  // -- media ----------------------------------------------------------------

  function stageMedia(filename: string, file: File): void {
    media.value.set(filename, file);
    markDirty();
  }

  function unstageMedia(filename: string): void {
    media.value.delete(filename);
  }

  // -- save -----------------------------------------------------------------

  async function save(): Promise<boolean> {
    if (!pack.value) return false;
    saving.value = true;
    saveError.value = null;

    const form = new FormData();
    form.append("data", JSON.stringify(pack.value));
    for (const [filename, file] of media.value) {
      form.append(filename, file);
    }

    try {
      const result = await api.savePack(pack.value.id, form);
      applyNewIds(result.ids);
      media.value.clear();
      dirty.value = false;
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        saveError.value = err.body as PackSaveError;
      } else {
        saveError.value = { response: "An unknown error occurred, try again later." };
      }
      return false;
    } finally {
      saving.value = false;
    }
  }

  /** Replaces temp ids with the database's, per the save response. */
  function applyNewIds(ids: Record<string, string>): void {
    if (!pack.value) return;
    for (const round of pack.value.rounds) {
      round.id = ids[round.id] ?? round.id;
      for (const category of round.categories) {
        category.id = ids[category.id] ?? category.id;
        category.round_id = round.id;
        for (const question of category.questions) {
          question.id = ids[question.id] ?? question.id;
          question.category_id = category.id;
        }
      }
    }
  }

  return {
    pack,
    rounds,
    finaleRound,
    activeRound,
    loading,
    saving,
    dirty,
    media,
    saveError,
    load,
    markDirty,
    addRound,
    deleteRound,
    addCategory,
    deleteCategory,
    copyCategories,
    addQuestion,
    deleteQuestion,
    sortQuestions,
    stageMedia,
    unstageMedia,
    save,
  };
});
