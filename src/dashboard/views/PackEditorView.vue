<script setup lang="ts">
/**
 * Ports templates/dashboard/question_pack.html + static/js/question_pack.js.
 *
 * Phase 2 target. The store already replaces the DOM<->data plumbing; what
 * remains is the editing UI itself. The genuinely non-trivial parts left to
 * port from question_pack.js are, roughly in order of effort:
 *
 *   - MediaDropTarget: drag/drop, handleURLDataTransfers (dropping an <img>
 *     from another tab), the /api/packs/fetch CORS proxy, getRandomFilename,
 *     showMediaPreview, maximizeMedia, border colour. ~450 lines today.
 *   - AnswerChoices: add/delete/reorder, syncChoiceSelection keeping the
 *     answer <select> in step with the choice list. ~120 lines.
 *   - resizeRoundWrappers / the input-resizer spans: auto-sizing text inputs
 *     to their content. Replaceable with a small directive, or CSS `field-sizing`
 *     where support allows.
 *   - showHighlightError: now driven by `store.saveError`, see below.
 */
import { onBeforeUnmount, onMounted } from "vue";

import { usePackEditorStore } from "../stores/packEditor";

const props = defineProps<{ packId: string }>();
const store = usePackEditorStore();

onMounted(() => store.load(props.packId));

// The old page had no unsaved-changes guard; worth adding while we're here.
function warnIfDirty(event: BeforeUnloadEvent): void {
  if (store.dirty) event.preventDefault();
}
window.addEventListener("beforeunload", warnIfDirty);
onBeforeUnmount(() => window.removeEventListener("beforeunload", warnIfDirty));
</script>

<template>
  <div id="question-pack-wrapper">
    <div v-if="store.loading">Loading…</div>

    <template v-else-if="store.pack">
      <header id="question-pack-header">
        <input v-model="store.pack.name" class="question-pack-name" @input="store.markDirty()" />

        <button
          id="question-pack-save-btn"
          class="default-button"
          :disabled="store.saving || !store.dirty"
          @click="store.save()"
        >
          {{ store.saving ? "Saving…" : store.dirty ? "Save" : "Saved" }}
        </button>
      </header>

      <p v-if="store.saveError" class="question-pack-error">{{ store.saveError.response }}</p>

      <nav id="question-pack-rounds">
        <button
          v-for="(round, index) in store.rounds"
          :key="round.id"
          :class="{ active: index === store.activeRound }"
          @click="store.activeRound = index"
        >
          {{ round.name }}
        </button>
        <button @click="store.addRound()">+</button>
      </nav>

      <!-- TODO(phase-2): <CategoryColumn> / <QuestionCard> / <QuestionEditor>.
           Rendering the tree read-only for now so the store and the save round
           trip can be exercised end to end against the real backend. -->
      <section v-if="store.rounds[store.activeRound]" class="question-pack-round">
        <div
          v-for="category in store.rounds[store.activeRound].categories"
          :key="category.id"
          class="question-pack-category"
        >
          <input
            v-model="category.name"
            placeholder="Category name"
            @input="store.markDirty()"
          />
          <ul>
            <li v-for="question in category.questions" :key="question.id">
              {{ question.value }} — {{ question.question || "(empty)" }}
            </li>
          </ul>
          <button @click="store.addQuestion(category.id)">Add question</button>
        </div>

        <button @click="store.addCategory(store.rounds[store.activeRound].id)">
          Add category
        </button>
      </section>
    </template>
  </div>
</template>
