<script setup lang="ts">
/**
 * Ports templates/presenter/lobby.html.
 */
import { computed, onMounted, ref, capitalize } from "vue";
import { useRouter } from "vue-router";

import { pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import { useActionKey } from "@shared/composables/useActionKey";

import Logo from "../components/Logo.vue";
import { useGameStore } from "../stores/game";

defineProps<{ gameId: string }>();

const store = useGameStore();
const router = useRouter();
const { setHandlers } = useActionKey();
const t = pageStrings("presenter/lobby");

const music = ref<HTMLAudioElement | null>(null);
const musicStarted = ref(false);

const lobbyMusic = computed(() => store.state?.game && musicSrc());
function musicSrc(): string | undefined {
  // lobby_music comes back already prefixed with the pack's data path.
  return staticUrl(store.state?.lobby_info?.lobby_music ?? null);
}

async function begin(): Promise<void> {
  await store.advance("selection");
  await router.push({ name: "selection", params: { gameId: store.game!.id } });
}

onMounted(() => {
  setHandlers({
    onAction: () => {
      if (music.value && !musicStarted.value) {
        musicStarted.value = true;
        void music.value.play();
        // Second press begins the game; the delay stops a double-tap skipping
        // straight past the music.
        setTimeout(() => setHandlers({ onAction: () => void begin() }), 1000);
        return;
      }
      void begin();
    },
  });

  console.debug("on_lobby_mounted");
});
</script>

<template>
  <div id="menu-wrapper">
    <Logo />

    <h2 id="menu-game-title">{{ store.game?.title }}</h2>

    <div id="menu-lobby-url">
      <div>{{ t("lobby_url_1") }}</div>
      <span id="menu-join-url">{{ store.state?.lobby_info?.join_url }}</span>
      <div>{{ t("lobby_url_3") }}</div>
    </div>

    <h3>{{ capitalize(t("contestants")) }}</h3>

    <div id="menu-contestants">
      <p v-if="!store.contestants.length" id="menu-no-contestants-placeholder">
        {{ t("none_joined") }}
      </p>

      <div
        v-for="contestant in store.contestants"
        :key="contestant.id"
        class="menu-contestant-entry"
        :class="`menu-contestant-${contestant.id}`"
        :style="{ border: `2px solid ${contestant.color}` }"
      >
        <img
          class="menu-contestant-avatar"
          :src="staticUrl(contestant.avatar)"
          :style="{ border: `2px solid ${contestant.color}` }"
          alt=""
        />
        <div class="menu-contestant-name">{{ contestant.name }}</div>
      </div>
    </div>
  </div>

  <audio
    v-if="lobbyMusic"
    ref="music"
    :src="lobbyMusic"
    :volume="store.state?.lobby_info?.lobby_volume ?? 1"
    loop 
  />
</template>
