<script setup lang="ts">
/**
 * Ports templates/dashboard/create_game.html.
 *
 * The old form POSTed to Flask and got a redirect back with `?error=`. Now it
 * posts JSON and gets the created game, then hard-navigates to the presenter
 * entry point.
 */
import { onMounted, reactive, ref } from "vue";

import { api, ApiError } from "@shared/api";
import type { QuestionPack } from "@shared/types";

import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const packs = ref<QuestionPack[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

const form = reactive({
  title: "",
  password: "",
  regular_rounds: 2,
  max_contestants: 4,
  answer_time: 6,
  use_daily_doubles: true,
  use_powerups: true,
  pack_id: "",
});

onMounted(async () => {
  packs.value = await api.listPacks();
  form.title = `${auth.user?.user_name ?? "My"}'s Game`;
});

async function submit(): Promise<void> {
  error.value = null;
  busy.value = true;

  const body = new FormData();
  for (const [key, value] of Object.entries(form)) {
    body.append(key, String(value));
  }

  try {
    const game = await api.createGame(body);
    window.location.href = `/jeoparty/presenter/${game.id}/lobby`;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : "Could not create game";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div id="create-game-wrapper">
    <div>
      <h1>Create Game</h1>
  
      <form @submit.prevent="submit">
        <div class="input-field">
          <label for="title">Lobby Name</label>
          <input id="title" v-model="form.title" maxlength="64" required />
        </div>
  
        <div class="input-field">
          <label for="password">Password</label>
          <input id="password" v-model="form.password" placeholder="Optional password" />
        </div>
  
        <div class="input-field">
          <label for="rounds">Regular Rounds</label>
          <input id="rounds" v-model.number="form.regular_rounds" type="number" min="1" max="9" />
        </div>
  
        <div class="input-field">
          <label for="contestants">Contestants</label>
          <input
            id="contestants"
            v-model.number="form.max_contestants"
            type="number"
            min="1"
            max="10"
          />
        </div>
  
        <div class="input-field">
          <label for="answer-time">Answer Time</label>
          <input id="answer-time" v-model.number="form.answer_time" type="number" min="3" max="15" />
        </div>
  
        <div class="input-field">
          <label for="doubles" style="display: inline">Include Daily Doubles</label>
          <input id="doubles" v-model="form.use_daily_doubles" type="checkbox" />
        </div>
  
        <div class="input-field">
          <label for="powers" style="display: inline">Allow Power-Ups</label>
          <input id="powers" v-model="form.use_powerups" type="checkbox" />
        </div>
  
        <div class="input-field">
          <label for="pack">Question Pack</label>
          <select id="pack" v-model="form.pack_id" required>
            <option value="" disabled>Select Pack</option>
            <option v-for="pack in packs" :key="pack.id" :value="pack.id">{{ pack.name }}</option>
          </select>
        </div>
  
        <input type="submit" value="Create" class="default-button" :disabled="busy" />
      </form>
  
      <p v-if="error" id="dashboard-form-error">{{ error }}</p>
    </div>
  </div>
</template>
