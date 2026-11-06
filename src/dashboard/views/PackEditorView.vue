<script setup lang="ts">
/**
 * Ports templates/dashboard/question_pack.html + static/js/question_pack.js.
 *
 * The store owns the tree and the save round trip; the pieces of the old page
 * live in components:
 *
 *   - CategoryColumn: one board column, its question cards, hover previews and
 *     drag-to-reorder.
 *   - QuestionEditor: the full-screen editable question view, editing a copy.
 *     MediaDropTarget and AnswerChoices are its parts.
 *   - vAutoWidth: the input-resizer spans.
 *
 * resizeRoundWrappers is gone: every round shares one CSS grid cell, so the
 * board is always as big as its largest round and switching tabs doesn't jump.
 *
 * showHighlightError is driven by `store.saveError`, which client-side
 * validation fills in too, so a new row without a database id can still be
 * pointed at.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";

import { api } from "@shared/api";
import { staticUrl } from "@shared/static";
import type {
  Language,
  PackSaveError,
  Question,
  QuestionCategory,
  QuestionRound,
  Theme,
} from "@shared/types";

import CategoryColumn from "../components/CategoryColumn.vue";
import QuestionEditor from "../components/QuestionEditor.vue";
import { AUDIO_TYPES } from "../media";
import { usePackEditorStore } from "../stores/packEditor";

const props = defineProps<{ packId: string }>();
const store = usePackEditorStore();
const route = useRoute();
const router = useRouter();

const LANGUAGES: Language[] = ["english", "danish"];
/** `round: {"le": 10}` on QuestionRound. */
const MAX_ROUNDS = 10;

const themes = ref<Theme[]>([]);
const loadError = ref<string | null>(null);

onMounted(async () => {
  const [loaded, loadedThemes] = await Promise.allSettled([
    store.load(props.packId),
    api.listThemes(),
  ]);
  if (loadedThemes.status === "fulfilled") themes.value = loadedThemes.value;
  if (loaded.status === "rejected") {
    loadError.value = "The question pack was not found or you do not have access to it.";
    return;
  }
  restoreFromHash();

  console.debug("on_pack_mounted");
});

// -- unsaved changes --------------------------------------------------------

// The old page had no unsaved-changes guard.
function warnIfDirty(event: BeforeUnloadEvent): void {
  if (store.dirty) event.preventDefault();
}
window.addEventListener("beforeunload", warnIfDirty);
onBeforeUnmount(() => window.removeEventListener("beforeunload", warnIfDirty));

onBeforeRouteLeave(() => !store.dirty || confirm("You have unsaved changes. Leave anyway?"));

// -- rounds -----------------------------------------------------------------

const prevRound = (index: number): QuestionRound | undefined => store.rounds[index - 1];

function roundLabel(round: QuestionRound, index: number): string {
  return store.isFinale(round.id) ? "Finale" : `Round ${index + 1}`;
}

function isRoundVisible(round: QuestionRound): boolean {
  return !store.isFinale(round.id) || Boolean(store.pack?.include_finale);
}

function deleteRound(round: QuestionRound): void {
  if (!confirm("Are you sure you want to delete this round and all its data?")) return;
  store.deleteRound(round.id);
}

function onFinaleToggled(): void {
  const slot = store.finaleSlot;
  if (!store.pack?.include_finale && slot && store.rounds[store.activeRound] === slot) {
    store.activeRound = store.rounds.length - 2;
  }
}

// -- categories / questions -------------------------------------------------

/** The category just added, so its name input can take focus. */
const focusCategoryId = ref<string | null>(null);

function addCategory(round: QuestionRound): void {
  focusCategoryId.value = store.addCategory(round.id)?.id ?? null;
}

interface EditorTarget {
  categoryId: string;
  question: Question;
  isNew: boolean;
  highlight: PackSaveError | null;
}
const editing = ref<EditorTarget | null>(null);

const editingCategory = computed(() =>
  editing.value ? store.findCategory(editing.value.categoryId) : undefined,
);
const editingIsFinale = computed(() => {
  const round = editing.value && store.roundOfCategory(editing.value.categoryId);
  return round ? store.isFinale(round.id) : false;
});

function openQuestion(
  category: QuestionCategory,
  questionId: string | null,
  highlight: PackSaveError | null = null,
): void {
  const question = questionId
    ? category.questions.find((q) => q.id === questionId)
    : store.newQuestion(category.id);
  if (!question) return;
  editing.value = { categoryId: category.id, question, isNew: !questionId, highlight };
}

function onQuestionSaved(
  question: Question,
  patch: Pick<QuestionCategory, "buzz_time" | "bg_image">,
): void {
  if (!editing.value) return;
  store.commitQuestion(editing.value.categoryId, question, patch);
  editing.value = null;
}

function locateQuestion(questionId: string) {
  for (const [roundIndex, round] of store.rounds.entries()) {
    for (const category of round.categories) {
      if (category.questions.some((q) => q.id === questionId)) return { roundIndex, category };
    }
  }
  return null;
}

// -- lobby music ------------------------------------------------------------

function onLobbyMusicPicked(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !store.pack) return;

  const name = AUDIO_TYPES.includes(file.type) ? store.stageMedia(file) : null;
  if (!name) {
    alert("Invalid file type. Lobby music must be an .mp3 or .wav file.");
    return;
  }
  store.pack.lobby_music = name;
}

function applyLobbyVolume(event: Event): void {
  const volume = store.pack?.lobby_volume;
  if (volume != null) (event.target as HTMLAudioElement).volume = volume;
}

function onLobbyVolumeChange(event: Event): void {
  if (store.pack) store.pack.lobby_volume = (event.target as HTMLAudioElement).volume;
}

// -- saving -----------------------------------------------------------------

type SaveState = "idle" | "pending" | "success" | "fail";
const saveState = ref<SaveState>("idle");
let saveStateTimer: ReturnType<typeof setTimeout> | undefined;

interface Popup {
  text: string;
  error: boolean;
  duration: number;
  key: number;
}
const popup = ref<Popup | null>(null);
let popupTimer: ReturnType<typeof setTimeout> | undefined;

function showPopup(text: string, error: boolean): void {
  const duration = error ? 10 : 6;
  popup.value = { text, error, duration, key: Date.now() };
  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => (popup.value = null), duration * 1000);
}

async function save(): Promise<void> {
  clearTimeout(saveStateTimer);
  saveState.value = "pending";

  const ok = await store.save();

  saveState.value = ok ? "success" : "fail";
  saveStateTimer = setTimeout(() => (saveState.value = "idle"), 3000);

  if (ok) showPopup("Question pack saved successfully.", false);
  else if (store.saveError) revealSaveError(store.saveError);
}

/** Takes the user to whatever the error points at. */
function revealSaveError(error: PackSaveError): void {
  showPopup(error.response, true);

  if (error.question_id) {
    const found = locateQuestion(error.question_id);
    if (found) {
      store.activeRound = found.roundIndex;
      openQuestion(found.category, error.question_id, error);
      return;
    }
  }

  const roundIndex = store.rounds.findIndex((r) => r.id === error.round_id);
  if (roundIndex !== -1) store.activeRound = roundIndex;
}

const errorFor = computed(() => {
  const error = store.saveError;
  const nameError = error?.field === "name";
  return {
    packName: nameError && !error?.round_id,
    roundName: nameError && !error?.category_id ? error?.round_id : undefined,
    categoryName: nameError ? error?.category_id : undefined,
    // A round-level complaint, e.g. too many categories in the finale.
    round: error && !error.field && !error.category_id ? error.round_id : undefined,
  };
});

// -- URL hash ---------------------------------------------------------------

/**
 * `#round_<index>;question_<id>`, so a reload lands where you were. The old
 * hash addressed questions by DOM position; ids survive reordering.
 */
function restoreFromHash(): void {
  const params = route.hash.replace(/^#/, "").split(";");
  for (const param of params) {
    if (param.startsWith("round_")) {
      const index = Number.parseInt(param.slice("round_".length), 10);
      if (index >= 0 && index < store.rounds.length) store.activeRound = index;
    }
  }
  if (!isRoundVisible(store.rounds[store.activeRound])) store.activeRound = 0;

  for (const param of params) {
    if (param.startsWith("question_")) {
      const questionId = param.slice("question_".length);
      const found = locateQuestion(questionId);
      if (found) {
        store.activeRound = found.roundIndex;
        openQuestion(found.category, questionId);
      }
    }
  }
}

watch(
  () => [store.activeRound, editing.value?.isNew ? null : editing.value?.question.id] as const,
  ([round, questionId]) => {
    if (!store.pack) return;
    const parts = [`round_${round}`];
    if (questionId) parts.push(`question_${questionId}`);
    void router.replace({ hash: `#${parts.join(";")}` });
  },
);
</script>

<template>
  <div id="question-pack-outer-wrapper">
    <div id="question-pack-wrapper">
      <div v-if="store.loading">Loading…</div>
      <p v-else-if="loadError" class="question-pack-editor-error" style="position: static">
        {{ loadError }}
      </p>

      <template v-else-if="store.pack">
        <div class="input-field">
          <label for="question-pack-name">Pack Name</label>
          <input
            id="question-pack-name"
            v-model="store.pack.name"
            :class="{ 'error-highlight': errorFor.packName }"
            type="text"
            maxlength="64"
            placeholder="Name of Pack"
          />
        </div>

        <div class="input-field split-input-field">
          <div>
            <label for="question-pack-public" style="display: inline">Public</label>
            <input id="question-pack-public" v-model="store.pack.public" type="checkbox" />
          </div>

          <div class="divider" />

          <div>
            <label for="question-pack-finale" style="display: inline">Final Jeopardy</label>
            <input
              id="question-pack-finale"
              v-model="store.pack.include_finale"
              type="checkbox"
              @change="onFinaleToggled"
            />
          </div>
        </div>

        <div class="input-field split-input-field">
          <div>
            <label for="question-pack-language">Language</label>
            <select id="question-pack-language" v-model="store.pack.language">
              <option v-for="lang in LANGUAGES" :key="lang" :value="lang">
                {{ lang[0].toUpperCase() + lang.slice(1) }}
              </option>
            </select>
          </div>

          <div class="divider" />

          <div>
            <label for="question-pack-theme">Theme</label>
            <select id="question-pack-theme" v-model="store.pack.theme_id">
              <option v-for="theme in themes" :key="theme.id" :value="theme.id">
                {{ theme.name }}
              </option>
              <option :value="null">Default</option>
            </select>
          </div>
        </div>

        <div id="question-pack-music-wrapper" class="input-field">
          <label for="question-pack-music-input">Lobby Music</label>
          <audio
            v-if="store.pack.lobby_music"
            id="question-pack-lobby-music"
            :key="store.pack.lobby_music"
            :src="store.mediaUrl(store.pack.lobby_music)"
            controls
            preload="metadata"
            @loadedmetadata="applyLobbyVolume"
            @volumechange="onLobbyVolumeChange"
          />
          <input
            id="question-pack-music-input"
            type="file"
            accept=".mp3, .wav"
            @change="onLobbyMusicPicked"
          />
        </div>

        <div id="question-pack-data-wrapper">
          <div id="question-pack-data-header">
            <div>
              <button
                v-for="(round, index) in store.rounds"
                v-show="isRoundVisible(round)"
                :key="round.id"
                class="question-pack-round-select-button"
                :class="{
                  'question-pack-round-selected': index === store.activeRound,
                  'question-pack-round-select-finale': store.isFinale(round.id),
                }"
                @click="store.activeRound = index"
              >
                <span>{{ roundLabel(round, index) }}</span>
                <div
                  v-if="store.canDeleteRound(round.id)"
                  title="Delete round"
                  @click.stop="deleteRound(round)"
                >
                  &times;
                </div>
              </button>
            </div>

            <button
              class="question-pack-add-round-btn"
              title="Add round"
              :disabled="store.rounds.length >= MAX_ROUNDS"
              @click="store.addRound()"
            >
              +
            </button>
          </div>

          <div id="question-pack-data-body">
            <div
              v-for="(round, index) in store.rounds"
              v-show="isRoundVisible(round)"
              :key="round.id"
              class="question-pack-round-wrapper"
              :class="{
                'question-pack-finale-wrapper': store.isFinale(round.id),
                'question-pack-round-inactive': index !== store.activeRound,
                'error-highlight': errorFor.round === round.id,
              }"
            >
              <div class="input-field">
                <label :for="`round-name-${index}`" class="question-pack-round-name-label">
                  Round Name
                </label>
                <input
                  :id="`round-name-${index}`"
                  v-model="round.name"
                  class="question-pack-round-name"
                  :class="{ 'error-highlight': errorFor.roundName === round.id }"
                  maxlength="64"
                />
              </div>

              <template v-if="round.categories.length === 0">
                <button class="question-pack-categories-placeholder" @click="addCategory(round)">
                  {{ store.isFinale(round.id) ? "Add Finale Question" : "Add a Category" }}
                </button>

                <button
                  v-if="!store.isFinale(round.id) && prevRound(index)?.categories.length"
                  class="question-pack-categories-copy"
                  @click="store.copyCategories(prevRound(index)!.id, round.id)"
                >
                  Copy Previous Categories
                </button>
              </template>

              <div class="question-pack-round-body">
                <CategoryColumn
                  v-for="category in round.categories"
                  :key="category.id"
                  :round="round"
                  :category="category"
                  :is-finale="store.isFinale(round.id)"
                  :autofocus="category.id === focusCategoryId"
                  :name-error="errorFor.categoryName === category.id"
                  @open="(questionId) => openQuestion(category, questionId)"
                />
              </div>

              <button
                v-if="round.categories.length > 0 && !store.isFinale(round.id)"
                class="question-pack-add-category-btn"
                title="Add category"
                @click="addCategory(round)"
              >
                +
              </button>
            </div>
          </div>

          <button
            id="question-pack-save-btn"
            class="default-button"
            :disabled="store.saving || !store.dirty"
            @click="save"
          >
            <Transition name="save-fade">
              <div v-if="saveState === 'idle'" class="save-btn-regular">Save</div>
              <div v-else-if="saveState === 'pending'" class="save-btn-pending">
                <div class="loading-icon" />
              </div>
              <div v-else-if="saveState === 'success'" class="save-btn-success">
                <img :src="staticUrl('img/success.png')" alt="Saved" />
              </div>
              <div v-else class="save-btn-fail">
                <img :src="staticUrl('img/error.png')" alt="Save failed" />
              </div>
            </Transition>
          </button>
        </div>

        <QuestionEditor
          v-if="editing && editingCategory"
          :key="editing.question.id"
          :question="editing.question"
          :category="editingCategory"
          :is-new="editing.isNew"
          :is-finale="editingIsFinale"
          :finale-value="store.finaleValue"
          :language="store.pack.language"
          :highlight="editing.highlight"
          @save="onQuestionSaved"
          @close="editing = null"
        />
      </template>

      <div
        v-if="popup"
        id="question-pack-popup"
        :key="popup.key"
        class="question-pack-popup-fixed"
        :class="popup.error ? 'popup-error' : 'popup-success'"
        :style="{ animationName: 'popup-animate', animationDuration: `${popup.duration}s` }"
      >
        {{ popup.text }}
      </div>
    </div>

  </div>
</template>

<style scoped src="../styles/default_button.css"></style>

<style scoped src="../styles/input_field.css"></style>

<style scoped src="../styles/loading_icon.css"></style>

<style scoped src="../styles/error_highlight.css"></style>

<style scoped src="../styles/editor_error.css"></style>

<style scoped>
#question-pack-outer-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

#question-pack-wrapper {
  position: relative;
  display: inline-block;
  min-width: 45vw;
  max-width: 90vw;
  margin: 0 auto;
  margin-top: 1vh;
  text-align: center;
  color: white;
  z-index: 10;
  padding: 20px;
}

#question-pack-wrapper .input-field {
  text-align: center;
}

#question-pack-popup {
  color: white;
  width: 30vw;
  min-width: 350px;
  margin: 0 auto;
  font-size: 1.5rem;
  text-align: center;
  background-color: #16163b;
  border-radius: 10px;
  border: 1px solid white;
  font-weight: 800;
  padding-left: 10px;
  padding-right: 10px;
  padding-top: 15px;
  padding-bottom: 15px;

  transform: translateY(-100%);

  animation-direction: alternate;
}

#question-pack-popup.popup-error {
  color: red;
}

#question-pack-data-wrapper {
  background: linear-gradient(to bottom, #2525c6, #130a4c);
  border: 2px solid white;
  border-radius: 5px;
  text-align: left;
  margin-top: 25px;
}

#question-pack-data-header {
  border-bottom: 1px solid white;
}

#question-pack-data-header > div {
  display: inline-block;
}

.question-pack-round-select-button {
  width: 120px;
}

.question-pack-add-round-btn {
  cursor: pointer;
  font-weight: bold;
}

.question-pack-round-select-button, .question-pack-add-round-btn {
  cursor: pointer;
  background-color: #000282;
  color: #ddd;
  border: 1px solid white;
  font-size: 16px;
  padding: 4px 8px;
}

.question-pack-round-selected {
  filter: brightness(1.2);
  font-weight: 800;
}

.question-pack-round-select-button > div {
  display: inline-block;
  cursor: pointer;
  font-size: 22px;
  line-height: 0.7;
  position: relative;
  margin-left: 3px;
  top: 1px;
}

#question-pack-name {
  font-size: 20px;
  max-width: 400px;
  text-align: center;
}

#question-pack-wrapper .split-input-field {
  position: relative;
  width: 30%;
  margin: 15px auto;
  display: flex;
  justify-content: space-around;
  background-color: #373737;
  padding: 10px;
  border-radius: 5px;
  border: 1px solid white;
}

.split-input-field > .divider {
  position: absolute;
  background-color: white;
  top: 0;
  height: 100%;
  width: 2px;
}

.split-input-field > div:first-of-type, .split-input-field > div:last-of-type {
  width: 50%;
}

.split-input-field label {
  font-size: 18px;
}

.split-input-field select {
  background-color: rgba(40, 40, 40, 0.75);
  font-size: 16px;
  display: block;
  margin: 0 auto;
  margin-top: 5px;
  color: white;
  border-radius: 5px;
  border-color: gray;
}

#question-pack-music-wrapper {
  width: 30%;
  margin: 0 auto;
  background-color: #373737;
  padding: 10px;
  border-radius: 5px;
  border: 1px solid white;
}

#question-pack-lobby-music {
  display: block;
  margin: 0 auto;
  margin: 5px auto;
}

.question-pack-round-select-finale {
  border-left: 3px solid white;
}

#question-pack-data-body {
  padding: 10px;
}

.question-pack-round-name {
  text-align: center;
  display: block;
  color: white;
  font-size: 18px;
  padding: 5px;
  margin: 0 auto;
  margin-bottom: 10px;
  background-color: rgba(40, 40, 40, 0.75);
}

.question-pack-round-name-label {
  font-weight: 800;
}

.question-pack-round-wrapper {
  position: relative;
}

.question-pack-round-wrapper > .input-field {
  display: block;
}

.question-pack-round-wrapper > div {
  display: inline-flex;
  flex-direction: row;
  justify-content: left;
}

.question-pack-finale-wrapper > div {
  display: flex;
  justify-content: center;
}

.question-pack-categories-placeholder, .question-pack-categories-copy {
  text-align: center;
  font-size: 16px;
  display: block;
  margin: 0 auto;
  padding: 10px;
  border-radius: 5px;
  border: 2px solid white;
  cursor: pointer;
  color: white;
  margin-bottom: 15px;
}

.question-pack-categories-placeholder {
  background-color: blue;
}

.question-pack-categories-copy {
  background-color: rgb(78, 32, 206);
}

.question-pack-categories-placeholder:hover {
  filter: brightness(1.25);
}

.question-pack-add-category-btn {
  position: relative;
  border: 2px dashed #ddd;
  cursor: pointer;
  line-height: 1;
  font-weight: bold;
  background-color: transparent;
  color: white;
  font-size: 15px;
  border-left: none;
  left: -6px;
}

.question-pack-add-category-btn:hover {
  background-color: rgba(255, 255, 255, 0.3);
}

#question-pack-save-btn {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
  border: 2px solid white;
  width: 70px;
  height: 46px;
  background-color: rgb(2, 154, 2);
  font-weight: bold;
  font-size: 16px;
  border-radius: 5px;
  padding: 0;
  margin: 15px auto;
}

#question-pack-save-btn:disabled {
  cursor: default;
  background-color: rgb(75, 75, 75);
}

#question-pack-save-btn > .save-btn-regular {
  position: absolute;
}

#question-pack-save-btn > .save-btn-pending {
  position: absolute;
  width: 30px;
  height: 30px;
  margin: 0 auto;
}

#question-pack-save-btn > .save-btn-pending > .loading-icon {
  height: 75%;
  width: 75%;
}

#question-pack-save-btn > .save-btn-success {
  position: absolute;
  height: 70%;
}

#question-pack-save-btn > .save-btn-success > img {
  position: relative;
  height: 100%;
  width: auto;
}

#question-pack-save-btn > .save-btn-fail {
  position: absolute;
  height: 70%;
}

#question-pack-save-btn > .save-btn-fail > img {
  position: relative;
  height: 100%;
  width: auto;
}

/* Replaces resizeRoundWrappers: all rounds stack in one cell and size it. */
#question-pack-data-body {
  display: grid;
}

#question-pack-data-body > .question-pack-round-wrapper {
  grid-area: 1 / 1;
}

.question-pack-round-inactive {
  visibility: hidden;
}

.question-pack-add-round-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

/* The old popup rendered below the board, often off screen. */
#question-pack-popup.question-pack-popup-fixed {
  position: fixed;
  top: 10px;
  left: 0;
  right: 0;
  z-index: 10000;
}

.save-fade-enter-active,
.save-fade-leave-active {
  transition: opacity 0.5s;
}

.save-fade-enter-from,
.save-fade-leave-to {
  opacity: 0;
}
</style>

<style>
/* Not scoped: named from JS, and scoped keyframes get a hashed name. */
@keyframes popup-animate {
  0% {
    transform: translateY(-100%);
  }
  15% {
    transform: translateY(0px);
  }
  85% {
    transform: translateY(0px);
  }
  100% {
    transform: translateY(-100%);
  }
}
</style>
