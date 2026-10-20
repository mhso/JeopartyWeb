<script setup lang="ts">
/** Ports templates/dashboard/home.html + the list half of routes/dashboard.py. */
import { onMounted, ref } from "vue";

import { api } from "@shared/api";
import { staticUrl } from "@shared/static";
import type { GameSummary, QuestionPack } from "@shared/types";

import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const games = ref<GameSummary[]>([]);
const packs = ref<QuestionPack[]>([]);
const loading = ref(true);

onMounted(async () => {
  [games.value, packs.value] = await Promise.all([api.listGames(), api.listPacks()]);
  loading.value = false;
});

async function deleteGame(gameId: string): Promise<void> {
  if (!confirm("Are you sure you want to delete this game?")) return;
  await api.deleteGame(gameId);
  games.value = games.value.filter((g) => g.id !== gameId);
}

async function deletePack(packId: string): Promise<void> {
  if (!confirm("Are you sure you want to delete this question pack?")) return;
  await api.deletePack(packId);
  packs.value = packs.value.filter((p) => p.id !== packId);
}

/**
 * A full navigation rather than a router push: the presenter is a separate
 * Vite entry point, so it needs a real document load.
 */
function resumeGame(game: GameSummary): void {
  if (game.resume_path) window.location.href = game.resume_path;
}
</script>

<template>
  <div id="dashboard-wrapper">
    <h1>Welcome, {{ auth.user?.user_name }}</h1>

    <div v-if="loading">Loading…</div>

    <div v-else id="dashboard-inner-wrapper">
      <div id="dashboard-games-list">
        <div class="dashboard-list-header">Your Games</div>

        <div id="dashboard-games-data">
          <!-- Replaces the Jinja for-loop; `resume_path` is absent once ended. -->
          <div
            v-for="game in games"
            :key="game.id"
            class="dashboard-game-entry-wrapper dashboard-entry-wrapper"
            :class="{ 'game-active': game.resume_path }"
            @click="resumeGame(game)"
          >
            <h3>{{ game.title }}</h3>
            <div class="dashboard-game-entry-question">Question Pack: {{ game.pack.name }}</div>
            <div class="dashboard-game-entry-rounds">
              Round {{ game.round }} / {{ game.regular_rounds + 1 }}
            </div>
            <div class="dashboard-game-entry-question">
              Question {{ game.question_num }} / {{ game.total_questions }}
            </div>
            <div class="dashboard-game-entry-powers">
              Power-Ups: {{ game.use_powerups ? "Yes" : "No" }}
            </div>
            <div class="dashboard-game-entry-stage">Stage: {{ game.stage }}</div>
            <div class="dashboard-game-entry-contestants">
              Contestants: {{ game.contestant_count }} / {{ game.max_contestants }}
            </div>
            <div class="dashboard-game-entry-created">Started: {{ game.started_at }}</div>
            <div class="dashboard-game-entry-ended" :class="{ 'game-active': !game.ended_at }">
              {{ game.ended_at ? `Ended: ${game.ended_at}` : "Ongoing" }}
            </div>

            <button class="dashboard-delete-btn" @click.stop="deleteGame(game.id)">
              <img :src="staticUrl('img/trash.png')" alt="Delete" />
            </button>
          </div>
        </div>

        <div v-if="!games.length" id="dashboard-game-list-empty">
          You haven't hosted any games yet.
        </div>

        <button class="dashboard-create-btn default-button">
          <RouterLink :to="{ name: 'create-game' }">New Game</RouterLink>
        </button>
      </div>

      <div id="dashboard-questions-list">
        <div class="dashboard-list-header">Your Question Packs</div>

        <div id="dashboard-questions-data">
          <div
            v-for="pack in packs"
            :key="pack.id"
            class="dashboard-questions-entry-wrapper dashboard-entry-wrapper"
            @click="$router.push({ name: 'pack', params: { packId: pack.id } })"
          >
            <h3>{{ pack.name }}</h3>
            <div class="dashboard-question-entry-questions">
              Questions: {{ pack.total_questions }}
            </div>
            <div class="dashboard-question-entry-created">Created: {{ pack.created_at }}</div>
            <div class="dashboard-question-entry-changed">Changed: {{ pack.changed_at }}</div>
            <div
              class="dashboard-question-entry-public"
              :class="pack.public ? 'pack-public' : 'pack-private'"
            >
              {{ pack.public ? "Public" : "Private" }}
            </div>

            <button
              class="dashboard-cheatsheet-btn"
              @click.stop="$router.push({ name: 'cheatsheet', params: { packId: pack.id } })"
            >
              <img :src="staticUrl('img/list.png')" alt="Cheatsheet" />
            </button>

            <button class="dashboard-delete-btn" @click.stop="deletePack(pack.id)">
              <img :src="staticUrl('img/trash.png')" alt="Delete" />
            </button>
          </div>
        </div>

        <div v-if="!packs.length" id="dashboard-questions-list-empty">
          You haven't created any question packs yet.
        </div>

        <button class="dashboard-create-btn default-button">
          <RouterLink :to="{ name: 'create-pack' }">Create Pack</RouterLink>
        </button>
      </div>
    </div>
  </div>
</template>
