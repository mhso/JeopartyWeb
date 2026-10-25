<script setup lang="ts">
/**
 * Ports the editable branch of templates/question_view.html and, from
 * question_pack.js: createQuestionView, saveQuestion, cancelCreateQuestion,
 * setDoBuzzTime, toggleMultipleChoice, setIsMultipleChoice, resizeMedia,
 * showMediaPreview, maximizeMedia, setMediaBorderColor, removeMediaColor and
 * setBackgroundImage.
 *
 * Edits a copy. Nothing reaches the store until "Save Question", so the close
 * button discards -- in the old page, closing an existing question left the
 * edits sitting in the DOM unsynced, to be picked up or lost at random.
 *
 * Buzz time and background image belong to the category, not the question,
 * but are edited here as before and committed along with the question.
 */
import { computed, onMounted, onUnmounted, reactive, ref, useId } from "vue";

import { i18n } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import type {
  Language,
  MediaSize,
  PackSaveError,
  Question,
  QuestionCategory,
  QuestionExtra,
} from "@shared/types";

import { vAutoWidth } from "../directives/autoWidth";
import { IMAGE_TYPES, toHexColor, VIDEO_TYPES } from "../media";
import { MAX_ANSWER_CHOICES, validateQuestion } from "../packValidation";
import { DEFAULT_BUZZ_TIME, usePackEditorStore } from "../stores/packEditor";
import AnswerChoices from "./AnswerChoices.vue";
import MediaDropTarget from "./MediaDropTarget.vue";

const props = defineProps<{
  question: Question;
  category: QuestionCategory;
  isNew: boolean;
  isFinale: boolean;
  finaleValue: number;
  language: Language;
  /** A failed save that points at this question. */
  highlight?: PackSaveError | null;
}>();

const emit = defineEmits<{
  save: [question: Question, categoryPatch: Pick<QuestionCategory, "buzz_time" | "bg_image">];
  close: [];
}>();

const store = usePackEditorStore();
const uid = useId();

/**
 * Config.QUESTION_MEDIA_SIZES, in vh. The presenter gets these from its state
 * payload; `GET /packs/<id>` doesn't send them, and they haven't changed.
 */
const MEDIA_SIZES: Record<MediaSize, number> = { small: 26, default: 42, maximized: 70 };

/** The pack's language, not the dashboard's: this previews what players will see. */
const t = (key: string) => i18n.global.t(`global.${key}`, {}, { locale: props.language });

// -- draft state ------------------------------------------------------------

const draft = reactive<Question>(JSON.parse(JSON.stringify(props.question)));
const extra = draft.extra;
if (props.isFinale) draft.value = props.finaleValue;

const multipleChoice = ref(Boolean(extra.choices));
const choices = ref<string[]>(extra.choices?.slice() ?? []);
const tips = ref<string[]>([...(extra.tips ?? []), "", ""].slice(0, Math.max(2, extra.tips?.length ?? 0)));
const explanation = ref(extra.explanation ?? "");
const buzzTime = ref(props.isFinale ? 0 : (props.category.buzz_time ?? 0));
const bgImage = ref(props.category.bg_image);

const error = ref<Pick<PackSaveError, "response" | "field" | "index"> | null>(
  props.highlight ?? null,
);

function build(): { question: Question; patch: Pick<QuestionCategory, "buzz_time" | "bg_image"> } {
  const result: QuestionExtra = { ...extra };

  if (multipleChoice.value) result.choices = choices.value.slice();
  else delete result.choices;

  const tipList = tips.value.map((tip) => tip.trim()).filter(Boolean);
  if (tipList.length) result.tips = tipList;
  else delete result.tips;

  if (explanation.value.trim()) result.explanation = explanation.value.trim();
  else delete result.explanation;

  return {
    question: { ...draft, value: Number(draft.value), extra: result },
    patch: { buzz_time: Number(buzzTime.value), bg_image: bgImage.value },
  };
}

const initial = JSON.stringify(build());

// -- media ------------------------------------------------------------------

const hasQuestionMedia = computed(() => Boolean(extra.question_image || extra.video));
const defaultSize = computed<MediaSize>(() => (multipleChoice.value ? "small" : "default"));
const maximized = computed(() => extra.height === "maximized");

/** Maximized media floats the question over it and hides the category header. */
const floatingHeader = computed(() => maximized.value && hasQuestionMedia.value);

const mediaStyle = computed(() => ({
  height: `${MEDIA_SIZES[extra.height ?? defaultSize.value]}vh`,
  borderColor: extra.border,
}));

const videoType = computed(() => (extra.video?.endsWith(".mp4") ? "video/mp4" : "video/webm"));

function setQuestionMedia(file: File): void {
  const name = store.stageMedia(file);
  if (!name) return;

  if (VIDEO_TYPES.includes(file.type)) {
    extra.video = name;
    delete extra.question_image;
  } else {
    extra.question_image = name;
    delete extra.video;
    delete extra.volume;
  }
  extra.height ??= defaultSize.value;
}

function setAnswerImage(file: File): void {
  const name = store.stageMedia(file);
  if (!name) return;
  extra.answer_image = name;
  extra.height ??= defaultSize.value;
}

function removeQuestionMedia(): void {
  delete extra.question_image;
  delete extra.video;
  delete extra.volume;
  if (maximized.value) extra.height = defaultSize.value;
  dropUnusedMediaSettings();
}

function removeAnswerImage(): void {
  delete extra.answer_image;
  dropUnusedMediaSettings();
}

function dropUnusedMediaSettings(): void {
  if (hasQuestionMedia.value || extra.answer_image) return;
  delete extra.height;
  delete extra.border;
}

function removeBorder(): void {
  delete extra.border;
}

function toggleMaximize(): void {
  extra.height = maximized.value ? defaultSize.value : "maximized";
}

function onVolumeChange(event: Event): void {
  extra.volume = (event.target as HTMLVideoElement).volume;
}

const bgInput = ref<HTMLInputElement | null>(null);
const bgStyle = computed(() =>
  bgImage.value ? { backgroundImage: `url(${store.mediaUrl(bgImage.value)})` } : undefined,
);

function onBackgroundPicked(): void {
  const file = bgInput.value?.files?.[0];
  if (bgInput.value) bgInput.value.value = "";
  if (!file) return;

  if (!IMAGE_TYPES.includes(file.type)) {
    alert("Invalid file type.");
    return;
  }
  bgImage.value = store.stageMedia(file) ?? bgImage.value;
}

// -- answer / timer ---------------------------------------------------------

function setMultipleChoice(enabled: boolean): void {
  multipleChoice.value = enabled;
  if (enabled && choices.value.length === 0) choices.value = [draft.answer];
  if (extra.height && !maximized.value) extra.height = defaultSize.value;
}

function setDoBuzzTime(enabled: boolean): void {
  buzzTime.value = enabled ? DEFAULT_BUZZ_TIME : 0;
}

// -- highlighting -----------------------------------------------------------

const highlighted = (field: string) => ({ "error-highlight": error.value?.field === field });
const choiceErrorIndex = computed(() =>
  error.value?.field === "choices" ? (error.value.index ?? 0) : null,
);

// -- save / close -----------------------------------------------------------

function save(): void {
  const { question, patch } = build();
  if (props.isFinale) question.value = props.finaleValue;

  const problem = validateQuestion(question);
  if (problem) {
    error.value = problem;
    return;
  }
  if (!Number.isInteger(patch.buzz_time) || patch.buzz_time! < 0 || patch.buzz_time! > 60) {
    error.value = { response: "Buzz-in time must be a whole number of seconds, at most 60", field: "buzz_time" };
    return;
  }

  emit("save", question, patch);
}

function close(): void {
  if (JSON.stringify(build()) !== initial) {
    const message = props.isNew
      ? "Are you sure you want to scrap this question?"
      : "Discard your changes to this question?";
    if (!confirm(message)) return;
  }
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") close();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="question-pack-question-view">
    <div class="bg-fill" :class="{ 'bg-image': bgImage }" :style="bgStyle" />

    <button
      class="question-bg-image-btn"
      title="Set category background image"
      @click="bgInput?.click()"
    >
      <img :src="staticUrl('img/bg_image_icon.png')" loading="lazy" alt="" />
    </button>
    <input
      ref="bgInput"
      class="question-bg-image-input"
      type="file"
      accept=".png, .jpeg, .jpg, .webp"
      hidden
      @change="onBackgroundPicked"
    />

    <div class="question-view-wrapper" @input="error = null">
      <h2 v-show="!floatingHeader" class="question-category-header">
        <div>
          <span class="question-category-span">{{ category.name || "Category Name" }}</span>
          <br />
          {{ t("for") }}
          <input
            v-model.number="draft.value"
            v-auto-width
            class="question-reward-span resize-target question-editable"
            :class="highlighted('value')"
            type="text"
            autocomplete="off"
            :readonly="isFinale"
            :title="isFinale ? 'The finale is worth the highest value in the pack' : undefined"
          />
          {{ " " }}
          <span class="question-reward-span">{{ t("points") }}</span>
          {{ " " }}
          <img
            v-if="multipleChoice"
            class="question-choices-indicator"
            :src="staticUrl('img/list.png')"
            alt=""
          />
        </div>
      </h2>

      <textarea
        v-if="!floatingHeader"
        v-model="draft.question"
        class="question-question-header question-editable"
        :class="highlighted('question')"
        rows="3"
        placeholder="Question Goes Here"
      />

      <div class="question-answer-explanation-wrapper">
        <label :for="`${uid}-answer`">Answer</label>

        <div>
          <select
            v-if="multipleChoice"
            :id="`${uid}-answer`"
            v-model="draft.answer"
            class="question-answer-selection"
            :class="highlighted('answer')"
          >
            <option v-for="(choice, index) in choices" :key="index" :value="choice">
              {{ choice }}
            </option>
          </select>
          <input
            v-else
            :id="`${uid}-answer`"
            v-model="draft.answer"
            v-auto-width
            class="question-answer-input resize-target"
            :class="highlighted('answer')"
            placeholder="Answer Goes Here"
          />
        </div>
        (<div>
          <input
            v-model="explanation"
            v-auto-width
            class="question-explanation-input resize-target"
            placeholder="Optional Explanation"
          />
        </div>)
      </div>

      <div class="question-question-image-wrapper">
        <textarea
          v-if="floatingHeader"
          v-model="draft.question"
          class="question-question-header question-editable question-header-floating"
          :class="highlighted('question')"
          rows="3"
          placeholder="Question Goes Here"
        />

        <MediaDropTarget
          title="Question Image/Video"
          :accept="[...IMAGE_TYPES, ...VIDEO_TYPES]"
          accept-extensions=".png, .jpeg, .jpg, .webp, .gif, .webm, .mp4"
          :has-media="hasQuestionMedia"
          :class="highlighted('media')"
          @file="setQuestionMedia"
          @remove="removeQuestionMedia"
        >
          <template #controls>
            <button
              class="media-maximize-btn media-control-btn"
              :title="maximized ? 'Shrink media' : 'Maximize media'"
              @click.stop="toggleMaximize"
            >
              <img :src="staticUrl(maximized ? 'img/pop_in.png' : 'img/pop_out.png')" alt="" />
            </button>

            <input
              class="media-color-btn media-control-btn"
              type="color"
              title="Border colour"
              :value="toHexColor(extra.border)"
              @click.stop
              @input="extra.border = ($event.target as HTMLInputElement).value"
            />
            <button
              v-if="extra.border"
              class="media-remove-color-btn media-control-btn"
              title="Remove border"
              @click.stop="removeBorder"
            >
              -
            </button>
          </template>

          <img
            v-if="extra.question_image"
            class="question-media question-question-image question-editable"
            :class="{ 'image-border': extra.border }"
            :src="store.mediaUrl(extra.question_image)"
            :style="mediaStyle"
            alt=""
          />
          <video
            v-else-if="extra.video"
            :key="extra.video"
            class="question-media question-question-video question-editable"
            :class="{ 'image-border': extra.border }"
            :style="mediaStyle"
            :volume="extra.volume ?? 1"
            controls
            preload="metadata"
            @volumechange="onVolumeChange"
          >
            <source :src="store.mediaUrl(extra.video)" :type="videoType" />
          </video>
        </MediaDropTarget>

        <MediaDropTarget
          title="Answer Image"
          :accept="IMAGE_TYPES"
          accept-extensions=".png, .jpeg, .jpg, .webp, .gif"
          :has-media="Boolean(extra.answer_image)"
          @file="setAnswerImage"
          @remove="removeAnswerImage"
        >
          <img
            class="question-media question-answer-image question-editable"
            :class="{ 'image-border': extra.border }"
            :src="store.mediaUrl(extra.answer_image)"
            :style="mediaStyle"
            alt=""
          />
        </MediaDropTarget>
      </div>

      <div class="input-field">
        <label :for="`${uid}-multiple-choice`" style="display: inline">Multiple Choice</label>
        <input
          :id="`${uid}-multiple-choice`"
          class="question-multiple-choice-checkbox"
          type="checkbox"
          :checked="multipleChoice"
          @change="setMultipleChoice(($event.target as HTMLInputElement).checked)"
        />
      </div>

      <AnswerChoices
        v-if="multipleChoice"
        v-model:choices="choices"
        v-model:answer="draft.answer"
        :max="MAX_ANSWER_CHOICES"
        :error-index="choiceErrorIndex"
        @empty="setMultipleChoice(false)"
      />

      <!-- The finale has no buzzing, so no buzz-in timer. -->
      <template v-if="!isFinale">
        <div class="input-field">
          <label :for="`${uid}-buzz`" style="display: inline">Include Buzz-In Timer</label>
          <input
            :id="`${uid}-buzz`"
            class="question-do-buzz-countdown"
            type="checkbox"
            :checked="buzzTime > 0"
            @change="setDoBuzzTime(($event.target as HTMLInputElement).checked)"
          />
        </div>

        <div
          v-if="buzzTime > 0"
          class="question-countdown-wrapper question-editable"
          :class="highlighted('buzz_time')"
          title="Seconds to buzz in. Shared by every question in the category."
        >
          <div class="question-countdown-filled question-editable" />
          <input
            v-model.number="buzzTime"
            class="question-countdown-text question-editable"
            type="number"
            min="1"
            max="60"
          />
        </div>
      </template>

      <div
        v-for="(_, index) in tips"
        :key="index"
        class="question-tip-wrapper question-editable"
        :class="`question-tip-${index + 1}`"
      >
        <h3 class="question-tip-header">Tip #{{ index + 1 }}</h3>
        <input v-model="tips[index]" class="question-tip-content question-editable" placeholder="Tip Text" />
      </div>
    </div>

    <button class="question-pack-question-view-exit" title="Close (Esc)" @click="close">&times;</button>

    <p v-if="error" class="question-pack-editor-error">{{ error.response }}</p>
    <button class="question-pack-question-view-save default-button" @click="save">
      Save Question
    </button>
  </div>
</template>
