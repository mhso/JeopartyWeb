<script setup lang="ts">
/** Ports templates/dashboard/cheatsheet.html -- a printable answer key. */
import { onMounted, ref } from "vue";

import { api } from "@shared/api";
import type { QuestionPack } from "@shared/types";

const props = defineProps<{ packId: string }>();
const pack = ref<QuestionPack | null>(null);

const activeRound = ref<number>(0);
const showCategories = ref<Array<Map<string, boolean>>>(new Array());

const roundNameShort = (roundIndex: number) => {
  return roundIndex == pack.value?.rounds.length && pack.value?.include_finale ? "Finale" : `Round ${roundIndex}`;
}

onMounted(async () => {
  pack.value = await api.getPack(props.packId);
  for (let i = 0; i < (pack.value ? pack.value?.rounds.length : 0); i++) {
    showCategories.value.push(new Map());
    for (let category of pack.value?.rounds[i].categories ?? []) {
      showCategories.value[i].set(category.id, false);
    }
  }
});
</script>

<template>
  <div v-if="pack" id="cheatsheet-outer-wrapper">
    <div v-if="pack" id="cheatsheet-wrapper">
      <h1>{{ pack.name }}</h1>
      <div id="cheatsheet-rounds-header">
        <button
          v-for="(round, roundIndex) in pack.rounds"
          :key="round.id"
          :style="{ borderColor: activeRound == roundIndex ? 'blue' : 'gray'}"
          @click="activeRound = roundIndex"
        >
        {{ roundNameShort(roundIndex + 1) }}
        </button>
      </div>

      <section v-for="(round, roundIndex) in pack.rounds" :key="round.id" v-show="roundIndex == activeRound">
        <h2>{{ round.name }}</h2>

        <div
          v-for="category in round.categories"
          :key="category.id"
          class="cheatsheet-category"
        >
          <div class="cheatsheet-category-header">
            <h3>{{ category.name }}</h3>
            <button
              @click="showCategories[roundIndex].set(category.id, !showCategories[roundIndex].get(category.id))"
            >
              {{ showCategories[roundIndex].get(category.id) ? 'Hide' : 'Show' }}
            </button>
          </div>
          <table class="cheatsheet-questions-table">
            <tr v-for="question in category.questions" :key="question.id" v-show="showCategories[roundIndex].get(category.id)">
              <td class="cheatsheet-value">{{ question.value }}:</td>
              <td class="cheatsheet-question">{{ question.question }}</td>
              <td class="cheatsheet-answer">
                {{ question.answer }}
                <span v-if="question.extra.explanation"> ({{ question.extra.explanation }})</span>
              </td>
            </tr>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
#cheatsheet-outer-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

#cheatsheet-wrapper {
  color: white;
}

#cheatsheet-rounds-header > button {
  padding: 5px;
  font-size: 18px;
  margin: 0 5px;
}

.cheatsheet-category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cheatsheet-category {
  margin: 10px 0;
}

.cheatsheet-category-header > button {
  padding: 5px;
  height: 40px;
}

.cheatsheet-questions-table {
  background-color: #252525;
  border: 1px solid white;
  color: rgb(240, 240, 240);
}

.cheatsheet-questions-table td {
  padding: 10px 5px;
  border-top: 1px solid white;
}

.cheatsheet-questions-table .cheatsheet-value {
  font-weight: 800;
}

.cheatsheet-questions-table .cheatsheet-answer {
  font-style: italic;
  color: rgb(39, 140, 223);
}
</style>
