<script setup lang="ts">
/** Ports templates/dashboard/cheatsheet.html -- a printable answer key. */
import { onMounted, ref } from "vue";

import { api } from "@shared/api";
import type { QuestionPack } from "@shared/types";

const props = defineProps<{ packId: string }>();
const pack = ref<QuestionPack | null>(null);

onMounted(async () => {
  pack.value = await api.cheatsheet(props.packId);
});
</script>

<template>
  <div v-if="pack" id="cheatsheet-wrapper">
    <h1>{{ pack.name }}</h1>

    <section v-for="round in pack.rounds" :key="round.id">
      <h2>{{ round.name }}</h2>

      <table v-for="category in round.categories" :key="category.id" class="cheatsheet-category">
        <caption>
          {{ category.name }}
        </caption>
        <tr v-for="question in category.questions" :key="question.id">
          <td class="cheatsheet-value">{{ question.value }}</td>
          <td class="cheatsheet-question">{{ question.question }}</td>
          <td class="cheatsheet-answer">
            {{ question.answer }}
            <span v-if="question.extra.explanation"> ({{ question.extra.explanation }})</span>
          </td>
        </tr>
      </table>
    </section>
  </div>
</template>
