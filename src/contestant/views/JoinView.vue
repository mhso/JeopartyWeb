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
import { useRoute } from "vue-router";

import { api, ApiError } from "@shared/api";
import { setLanguage, pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import type { ContestantLobbyInfo } from "@shared/types";

import { resizeImage, isValidImageType } from "../avatar";

const props = defineProps<{ joinCode: string }>();
const router = useRouter();
const route = useRoute();
const t = pageStrings("contestant/lobby");

const lobby = ref<ContestantLobbyInfo | null>(null);
const name = ref("");
const color = ref(randomColor());
const password = ref("");
const avatarFile = ref<File | null>(null);
const avatarPreview = ref<string | null>(null);
const userId = ref<string | null>(null);
const buzzSound = ref<string | null>(null);
const bgImage = ref<string | null>(null);
const error = ref<ApiError | null>(null);
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
    userId.value = typeof route.query.user_id === "string" && route.query.user_id ? route.query.user_id : null;
    lobby.value = await api.lobbyInfo(props.joinCode, userId.value);
    setLanguage(lobby.value.language);
    if (lobby.value.existing) {
      name.value = lobby.value.existing.name;
      color.value = lobby.value.existing.color;
      buzzSound.value = lobby.value.existing.buzz_sound;
      bgImage.value = lobby.value.existing.bg_image;
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      await router.replace({ name: "nogame" });
      return;
    }
    error.value = new ApiError(500, "Could not reach the server.");
  }
});

async function onAvatarSelected(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  if (!isValidImageType(file)) {
    const msg = `'${file.name}' is not a valid file type (should be .png, .gif, .jpg, or .webp).`;
    error.value = new ApiError(403, msg);
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

  const body = new FormData();
  body.append("join_code", props.joinCode);
  body.append("name", name.value);
  body.append("color", color.value);
  if (password.value) body.append("password", password.value);
  if (avatarFile.value) {
    body.append("avatar", avatarFile.value);
  }
  else if (lobby.value.existing?.avatar) {
    body.append("avatar", lobby.value.existing?.avatar);
  }
  else {
    body.append("default_avatar", "1");
  }
  if (userId.value) {
    body.append("id", userId.value);
  }
  if (buzzSound.value) {
    body.append("buzz_sound", buzzSound.value);
  }
  if (bgImage.value) {
    body.append("bg_image", bgImage.value);
  }

  try {
    const { game_id } = await api.join(body);
    await router.push({ name: "game", params: { gameId: game_id } });
  } catch (err) {
    error.value = err instanceof ApiError ? err : new ApiError(500, "Could not join the game.");
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

      <!-- Optional parameters -->
      <input v-if="userId" name="user_id" type="hidden" :value="userId">
      <input v-if="buzzSound" name="buzz_sound" type="hidden" :value="buzzSound">
      <input v-if="bgImage" name="bg_image" type="hidden" :value="bgImage">

      <input
        id="contestant-lobby-join"
        type="submit"
        :value="joining ? t('joining') : t('join')"
        :disabled="joining || !lobby"
      />
    </form>
  </div>

  <div v-if="error" id="contestant-lobby-status" class="error-status">{{ error.template ? t(error.template) : error.message }}</div>
</template>