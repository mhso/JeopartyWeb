<script setup lang="ts">
/**
 * Ports templates/contestant/lobby.html + static/js/contestant_lobby.js.
 *
 * The old form did a real POST to Flask which redirected to the game page on
 * success or back to itself with `?error=` on failure. Now it posts multipart
 * to the API, gets JSON, and routes client-side.
 */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { api, ApiError } from "@shared/api";
import { setLanguage, pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import { useWakeLock } from "@shared/composables/useWakeLock";
import type { ContestantLobbyInfo } from "@shared/types";

import { resizeImage, isValidImageType } from "../avatar";

const props = defineProps<{ joinCode: string }>();
const router = useRouter();
const wakeLock = useWakeLock();
const t = pageStrings("contestant/lobby");

const lobby = ref<ContestantLobbyInfo | null>(null);
const name = ref("");
const color = ref(randomColor());
const password = ref("");
const avatarFile = ref<File | null>(null);
const avatarPreview = ref<string | null>(null);
const error = ref<string | null>(null);
const joining = ref(false);

const avatarSrc = computed(
  () => avatarPreview.value ?? staticUrl(lobby.value?.existing?.avatar ?? lobby.value?.default_avatar),
);

function randomColor(): string {
  const channel = () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  return `#${channel()}${channel()}${channel()}`;
}

onMounted(async () => {
  try {
    lobby.value = await api.lobbyInfo(props.joinCode);
    setLanguage(lobby.value.language);
    if (lobby.value.existing) {
      name.value = lobby.value.existing.name;
      color.value = lobby.value.existing.color;
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      await router.replace({ name: "nogame" });
      return;
    }
    error.value = "Could not reach the server.";
  }
});

async function onAvatarSelected(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  if (!isValidImageType(file)) {
    error.value = `'${file.name}' is not a valid file type (should be .png, .gif, .jpg, or .webp).`;
    return;
  }

  // Downscale client-side before upload -- phone camera images are enormous
  // and the avatar renders at a couple of hundred pixels.
  const resized = await resizeImage(file, 256);
  avatarFile.value = resized;
  avatarPreview.value = URL.createObjectURL(resized);
}

async function join(): Promise<void> {
  if (joining.value || !lobby.value) return;
  joining.value = true;
  error.value = null;
  void wakeLock.request();

  const body = new FormData();
  body.append("join_code", props.joinCode);
  body.append("name", name.value);
  body.append("color", color.value);
  if (password.value) body.append("password", password.value);
  if (avatarFile.value) {
    body.append("avatar", avatarFile.value);
  } else {
    body.append("default_avatar", "1");
  }

  try {
    const { game_id } = await api.join(body);
    await router.push({ name: "game", params: { gameId: game_id } });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : "Could not join the game.";
    joining.value = false;
  }
}

</script>

<template>
  <div id="contestant-lobby-wrapper">
    <h1>{{ t("welcome_header") }}</h1>

    <form id="contestant-join-form" @submit.prevent="join">
      <div id="contestant-lobby-avatar-wrapper">
        <input
          id="contestant-lobby-avatar-input"
          type="file"
          accept=".png,.jpeg,.jpg,.webp"
          @change="onAvatarSelected"
        />
        <img id="contestant-lobby-avatar-img" :src="avatarSrc" alt="" />
      </div>

      <input
        id="contestant-lobby-name"
        v-model="name"
        :placeholder="t('placeholder_name')"
        maxlength="16"
        required
      />

      <label id="contestant-lobby-color-label" for="contestant-lobby-color">
        {{ t("color_label") }}
      </label>
      <input id="contestant-lobby-color" v-model="color" type="color" />

      <template v-if="lobby?.has_password">
        <label id="contestant-lobby-password-label" for="contestant-lobby-password">
          Password
        </label>
        <input id="contestant-lobby-password" v-model="password" type="password" />
      </template>

      <input
        id="contestant-lobby-join"
        type="submit"
        :value="t('join')"
        :disabled="joining || !lobby"
      />
    </form>
  </div>

  <div v-if="error" id="contestant-lobby-status" class="error-status">{{ t(error) }}</div>
</template>
