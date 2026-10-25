<script setup lang="ts">
/**
 * Ports the editable `.question-choices-wrapper` from question_view.html and
 * addAnswerChoice, deleteAnswerChoice and syncChoiceSelection from
 * question_pack.js.
 *
 * syncChoiceSelection kept the answer <select>'s options in step with the
 * choice inputs by matching option text against input values. Here the
 * select renders straight from `choices`, so the only thing left to sync is
 * the answer itself: renaming the choice that *is* the answer renames the
 * answer with it.
 *
 * Choices can be reordered by dragging their letter.
 */
import { ref } from "vue";

const props = defineProps<{
  max: number;
  /** 1-based index of a choice to flag, or 0 to flag the whole list. */
  errorIndex?: number | null;
}>();

const choices = defineModel<string[]>("choices", { required: true });
const answer = defineModel<string>("answer", { required: true });

const emit = defineEmits<{
  /** The last choice was removed; the question is no longer multiple choice. */
  empty: [];
}>();

const LETTERS = "ABCDEFGH";
const dragFrom = ref<number | null>(null);

function addChoice(): void {
  if (choices.value.length >= props.max) {
    alert(`A maximum of ${props.max} choices are allowed.`);
    return;
  }
  choices.value = [...choices.value, ""];
}

function renameChoice(index: number, text: string): void {
  const next = choices.value.slice();
  if (answer.value === next[index]) answer.value = text;
  next[index] = text;
  choices.value = next;
}

function deleteChoice(index: number): void {
  const removed = choices.value[index];
  const next = choices.value.filter((_, i) => i !== index);
  choices.value = next;

  if (answer.value === removed && next.length > 0) answer.value = next[0];
  if (next.length === 0) emit("empty");
}

function onDrop(index: number): void {
  if (dragFrom.value === null || dragFrom.value === index) return;
  const next = choices.value.slice();
  const [moved] = next.splice(dragFrom.value, 1);
  next.splice(index, 0, moved);
  choices.value = next;
  dragFrom.value = null;
}
</script>

<template>
  <div class="question-choices-wrapper" :class="{ 'error-highlight': errorIndex === 0 }">
    <div
      v-for="(choice, index) in choices"
      :key="index"
      class="question-choice-entry question-editable"
      :class="[`question-choice-${index + 1}`, { 'error-highlight': errorIndex === index + 1 }]"
      @dragover.prevent
      @drop.prevent="onDrop(index)"
    >
      <button title="Remove choice" @click="deleteChoice(index)">&times;</button>
      <p>
        <span
          class="question-choice-number"
          draggable="true"
          title="Drag to reorder"
          style="cursor: grab"
          @dragstart="dragFrom = index"
          @dragend="dragFrom = null"
        >
          {{ LETTERS[index] }}:
        </span>
        {{ " " }}
        <input
          class="question-choice-text question-editable"
          placeholder="Choice Text Here"
          maxlength="32"
          :value="choice"
          @input="renameChoice(index, ($event.target as HTMLInputElement).value)"
        />
      </p>
    </div>

    <button class="question-add-choice" title="Add choice" @click="addChoice">+</button>
  </div>
</template>
