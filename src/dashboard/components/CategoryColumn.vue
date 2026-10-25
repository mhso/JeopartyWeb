<script setup lang="ts">
/**
 * Ports one `.question-pack-category-wrapper` from question_pack.html, with
 * addCategory's header, deleteCategory, deleteQuestion, showQuestionPreview
 * and the questionDrag* handlers from question_pack.js.
 *
 * Questions reorder by dragging within their own column; the drop zones sit
 * between the cards exactly where they were, and the store keeps the value
 * slots fixed while the questions move through them.
 */
import { onMounted, ref } from "vue";

import type { QuestionCategory, QuestionRound } from "@shared/types";

import { usePackEditorStore } from "../stores/packEditor";

const props = defineProps<{
  round: QuestionRound;
  category: QuestionCategory;
  isFinale: boolean;
  /** Focus the name input on mount, for a category the user just added. */
  autofocus?: boolean;
  /** A failed save that points at this category's name. */
  nameError?: boolean;
}>();

const emit = defineEmits<{
  /** Open the editor on a question, or on a new one for `null`. */
  open: [questionId: string | null];
}>();

const store = usePackEditorStore();

const nameInput = ref<HTMLInputElement | null>(null);
const hovered = ref<string | null>(null);
const dragFrom = ref<number | null>(null);
/** Drop zone k sits above question k; the last one sits below everything. */
const activeZone = ref<number | null>(null);

onMounted(() => {
  if (props.autofocus) nameInput.value?.focus();
});

function displayValue(value: number): number {
  return props.isFinale ? store.finaleValue : value;
}

function deleteCategory(): void {
  if (!confirm("Are you sure you want to delete this category and all its data?")) return;
  store.deleteCategory(props.round.id, props.category.id);
}

function deleteQuestion(questionId: string): void {
  if (!confirm("Are you sure you want to delete this question?")) return;
  store.deleteQuestion(props.category.id, questionId);
}

function onDragStart(event: DragEvent, index: number): void {
  dragFrom.value = index;
  hovered.value = null;
  event.dataTransfer?.setData("text/plain", props.category.questions[index].id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDragOver(zone: number): void {
  // Only questions from this column; anything else isn't ours to drop.
  if (dragFrom.value !== null) activeZone.value = zone;
}

function onDrop(zone: number): void {
  const from = dragFrom.value;
  activeZone.value = null;
  dragFrom.value = null;
  if (from === null) return;

  const to = zone > from ? zone - 1 : zone;
  store.moveQuestion(props.category.id, from, to);
}

function onDragEnd(): void {
  dragFrom.value = null;
  activeZone.value = null;
}
</script>

<template>
  <div class="question-pack-category-wrapper">
    <div class="question-pack-category-header">
      <button
        class="question-pack-delete-category-btn delete-button"
        title="Delete category"
        @click="deleteCategory"
      >
        &times;
      </button>
      <input
        ref="nameInput"
        v-model="category.name"
        class="question-pack-category-name"
        :class="{ 'error-highlight': nameError }"
        placeholder="Category Name"
      />
    </div>

    <div class="question-pack-category-body">
      <div v-for="(question, index) in category.questions" :key="question.id">
        <div
          v-if="index === 0"
          class="question-pack-question-dropzone question-first-dropzone"
          :data-drop_active="activeZone === 0"
          @dragover.prevent="onDragOver(0)"
          @dragleave="activeZone = null"
          @drop.prevent="onDrop(0)"
        />

        <div
          class="question-pack-question-wrapper"
          draggable="true"
          @click="emit('open', question.id)"
          @dragstart="onDragStart($event, index)"
          @dragend="onDragEnd"
          @mouseenter="hovered = question.id"
          @mouseleave="hovered = null"
        >
          <button
            class="question-pack-delete-question-btn delete-button"
            title="Delete question"
            @click.stop="deleteQuestion(question.id)"
          >
            &times;
          </button>
          <div class="question-pack-question-value">{{ displayValue(question.value) }}</div>
        </div>

        <div
          class="question-pack-question-dropzone"
          :data-drop_active="activeZone === index + 1"
          @dragover.prevent="onDragOver(index + 1)"
          @dragleave="activeZone = null"
          @drop.prevent="onDrop(index + 1)"
        />

        <div v-if="hovered === question.id" class="question-pack-question-preview">
          <h3>{{ question.question || "(No question yet)" }}</h3>
          <h4>{{ question.answer || "(No answer yet)" }}</h4>
        </div>
      </div>
    </div>

    <!-- The finale takes exactly one question. -->
    <button
      v-if="!isFinale || category.questions.length === 0"
      class="question-pack-add-question-btn"
      title="Add question"
      @click="emit('open', null)"
    >
      +
    </button>
  </div>
</template>
