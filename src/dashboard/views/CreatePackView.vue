<script setup lang="ts">
/**
 * Ports templates/dashboard/create_pack.html.
 * Multipart because of the optional lobby music upload.
 */
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import { api, ApiError } from "@shared/api";
import type { Language, Theme } from "@shared/types";

import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();

const themes = ref<Theme[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);
const music = ref<File | null>(null);

const LANGUAGES: Language[] = ["english", "danish"];

const form = reactive({
  name: "",
  public: false,
  include_finale: true,
  theme_id: "none",
  language: "english" as Language,
});

onMounted(async () => {
  themes.value = await api.listThemes();
  form.name = `${auth.user?.user_name ?? "My"}'s Question Pack`;
});

function onMusicSelected(event: Event): void {
  music.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

async function submit(): Promise<void> {
  error.value = null;
  busy.value = true;

  const body = new FormData();
  for (const [key, value] of Object.entries(form)) {
    body.append(key, String(value));
  }
  if (music.value) body.append("music", music.value);

  try {
    const pack = await api.createPack(body);
    await router.push({ name: "pack", params: { packId: pack.id } });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : "Could not create pack";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div id="create-pack-wrapper">
    <h1>Create Question Pack</h1>

    <form @submit.prevent="submit">
      <div class="input-field">
        <label for="name">Pack Name</label>
        <input id="name" v-model="form.name" maxlength="64" required />
      </div>

      <div class="input-field">
        <label for="public" style="display: inline">Make Public</label>
        <input id="public" v-model="form.public" type="checkbox" />
      </div>

      <div class="input-field">
        <label for="finale" style="display: inline">Include Final Jeopardy</label>
        <input id="finale" v-model="form.include_finale" type="checkbox" />
      </div>

      <div class="input-field">
        <label for="theme">Theme</label>
        <select id="theme" v-model="form.theme_id">
          <option value="none">Default</option>
          <option v-for="theme in themes" :key="theme.id" :value="theme.id">
            {{ theme.name }}
          </option>
        </select>
      </div>

      <div class="input-field">
        <label for="language">Language</label>
        <select id="language" v-model="form.language">
          <option v-for="lang in LANGUAGES" :key="lang" :value="lang">
            {{ lang[0].toUpperCase() + lang.slice(1) }}
          </option>
        </select>
      </div>

      <div class="input-field">
        <label for="music">Lobby Music</label>
        <input id="music" type="file" accept=".mp3,.wav" @change="onMusicSelected" />
      </div>

      <input type="submit" value="Create" class="default-button" :disabled="busy" />
    </form>

    <p v-if="error" id="dashboard-form-error">{{ error }}</p>
  </div>
</template>
