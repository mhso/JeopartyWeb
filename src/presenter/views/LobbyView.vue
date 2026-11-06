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
  store.showTransitionOverlay = true;
  await store.advance("selection");
  await router.push({ name: "selection", params: { gameId: store.game!.id } });
  store.showTransitionOverlay = false;
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

    <div v-if="store.state?.lobby_info?.lan_mode" id="menu-lobby-url">
        Skriv <span id="menu-join-command">!jeopardy</span> i <strong>CoreNibbas</strong> for at joine!
    </div>

    <div v-else id="menu-lobby-url">
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
    id="menu-lobby-music"
    ref="music"
    :src="lobbyMusic"
    :volume="store.state?.lobby_info?.lobby_volume ?? 1"
    loop 
  />
</template>

<style scoped>
#menu-wrapper {
  margin: 0 auto;
  text-align: center;
  position: relative;
  color: white;
}

#menu-game-title {
  font-family: 'Lucida Sans';
  font-style: italic;
  filter: drop-shadow(5px 5px 5px black);
  border-bottom: 2px solid white;
  margin: 0 auto;
  width: fit-content;
  padding-bottom: 20px;
  margin-bottom: 30px;
  text-align: center;
  padding-left: 20px;
  padding-right: 20px;
  margin-top: 30px;
}

#menu-wrapper > h3 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  margin-top: 2.5rem;
  font-weight: 800;
  text-align: center;
}

#menu-wrapper > #logo-wrapper {
  padding-top: 60px;
  padding-bottom: 10px;
}

#menu-lobby-url {
  text-align: center;
  font-size: 24px;
  margin-top: 10px;
  line-height: 1.6;
}

#menu-join-url {
  color: #00abff;
  background-color: rgba(0, 0, 0, 0.76);
  padding: 5px;
}

#menu-join-command {
  font-family: Consolas;
}

#menu-join-url, #menu-join-command {
  background-color: rgba(0, 0, 0, 0.76);
  padding: 5px;
}

#menu-contestants {
  font-size: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 40vh;
  flex-wrap: wrap;
  align-content: center;
}

#menu-no-contestants-placeholder {
  font-size: 20px;
  font-style: italic;
}

.menu-contestant-entry {
  width: 180px;
  margin-bottom: 15px;
  text-align: left;
  border: 2px solid white;
  border-radius: 10px;
  padding: 10px;
  background-color: #101010;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: left;
}

.menu-contestant-avatar {
  width: 42px;
  border-radius: 24px;
}

.menu-contestant-name {
  text-align: left;
  font-size: 20px;
  color: white;
  margin-left: 10px;
  padding-bottom: 2px;
}
</style>
