<script setup lang="ts">
/**
 * Ports templates/presenter/endscreen.html + startWinnerParty() /
 * startEndscreenAnimation() in presenter.js.
 */
import { onMounted, ref } from "vue";

import { pageStrings } from "@shared/i18n";
import { staticUrl } from "@shared/static";
import { useActionKey } from "@shared/composables/useActionKey";

import Logo from "../components/Logo.vue";
import { useThemeOverlays } from "../composables/useThemeOverlays";
import { useGameStore } from "../stores/game";

defineProps<{ gameId: string }>();

const store = useGameStore();
const { setHandlers } = useActionKey();
const t = pageStrings("presenter/endscreen");

const { playOutro } = useThemeOverlays(() => store.stage);

const avatarFlipped = ref(false);
const showTechnoOverlay = ref(false);
const showConfettiVideo = ref(true);

const winners = store.state?.winners || [];
const sorted = store.game?.game_contestants?.sort(
  (a, b) => {
    if (a.score > b.score) {
      return -1;
    }
    if (a.score < b.score) {
      return 1;
    }

    return a.name < b.name ? -1 : 1;
  }
)

function startEndscreenAnimation() {
  let endscreenMusic = document.getElementById("endscreen-music") as HTMLAudioElement;
  let confettiVideo = document.getElementById("endscreen-confetti-video") as HTMLVideoElement;
  let overlay = document.getElementById("endscreen-techno-overlay") as HTMLDivElement;

  endscreenMusic.play();
  confettiVideo.play();
  showTechnoOverlay.value = true;

  setInterval(function() {
    avatarFlipped.value = !avatarFlipped.value;
  }, 472);

  let colors = ["#1dd8265e", "#1d74d85e", "#c90f0f69", "#deb5115c"];
  let colorIndex = 0;

  let initialDelay = 320;
  let intervalDelay = 472;

  setTimeout(() => {
    overlay.style.backgroundColor = colors[colorIndex];
    colorIndex += 1;

    setInterval(() => {
      overlay.style.backgroundColor = colors[colorIndex];

      colorIndex += 1;

      if (colorIndex == colors.length) {
        colorIndex = 0;
      }
    }, intervalDelay);
  }, initialDelay);

  // Add listener for stopping the party when the police knocks down the door
  setHandlers({
    onAction: () => {
      showTechnoOverlay.value = false;
      endscreenMusic.pause();
      confettiVideo.pause();
      showConfettiVideo.value = false;
    }
  });
}

function startWinnerParty() {
  const outroSound = playOutro();
  if (outroSound) {
    outroSound.onended = function() {
      startEndscreenAnimation();
    }
  }
  else {
    startEndscreenAnimation();
  }
}

onMounted(() => {
  setHandlers({
    onAction: startWinnerParty
  });

  console.debug("on_endscreen_mounted");
});
</script>

<template>
  <div id="endscreen-wrapper">
    <Logo />

    <div v-show="showTechnoOverlay" id="endscreen-techno-overlay"></div>

    <p id="endscreen-winner-desc">
      <template v-for="(winner, index) in winners" :key="winner.id">
        <span :style="{ color: winner.color, fontWeight: 800 }">{{ winner.name }}</span>
        <template v-if="index < winners.length - 2">,&nbsp;</template>
        <template v-else-if="index === winners.length - 2">&nbsp;{{ t("and") }}&nbsp;</template>
      </template>
      {{ winners.length === 1 ? t("winner_flavor_1") : (winners.length == 2 ? t("winner_flavor_2") : t("winner_flavor_3")) }}
    </p>

    <div id="endscreen-avatars-wrapper">
      <div v-for="winner in winners" :key="winner.id" class="endscreen-avatars-entry">
        <img class="endscreen-crown" :src="staticUrl('img/crown.png')" alt="" />
        <img class="endscreen-avatar" :src="staticUrl(winner.avatar)" :style="{ transform: avatarFlipped ? 'scaleX(-1)' : 'scaleX(1)' }" alt="" />
      </div>
    </div>

    <table id="endscreen-scores-table">
      <tr>
        <th>{{ t("name") }}</th>
        <th>{{ t("score") }}</th>
        <th>{{ t("buzzes") }}</th>
        <th>{{ t("correct") }}</th>
        <th>{{ t("wrong") }}</th>
      </tr>
      <tr v-for="contestant in sorted" :key="contestant.id">
        <td class="endscreen-score-name" :style="{ color: contestant.color }">
          {{ contestant.name }}
        </td>
        <td class="endscreen-score-data">{{ contestant.score }}</td>
        <td class="endscreen-score-data">{{ contestant.buzzes }}</td>
        <td class="endscreen-score-data">{{ contestant.hits }}</td>
        <td class="endscreen-score-data">{{ contestant.misses }}</td>
      </tr>
    </table>

    <!-- Confetti overlay video -->
    <video v-show="showConfettiVideo"
      id="endscreen-confetti-video"
      :src="staticUrl('img/confetti.webm')"
      muted
      loop
      preload="auto"
    />
  </div>

  <!-- Shooting Star celebratory music -->
  <audio
    id="endscreen-music"
    :volume="0.6"
    :src="staticUrl('data/sounds/shooting_star.mp3')"
  />
</template>

<style scoped>
#endscreen-wrapper {
  text-align: center;
  color: white;
}

#endscreen-wrapper > #logo-wrapper {
  width: 100%;
}

#endscreen-winner-desc {
  font-size: 3rem;
  margin-top: 30px;
  margin-bottom: 100px;
  text-shadow: 2px 2px 5px rgb(15, 15, 15);
}

#endscreen-avatars-wrapper {
  text-align: center;
  display: flex;
  flex-direction: row;
  justify-content: center;
}

.endscreen-avatars-entry {
  display: inline-block;
  position: relative;
  margin-left: 30px;
  margin-right: 30px;
}

.endscreen-crown {
  position: absolute;
  width: 160px;
  left: calc(50% - 80px);
  top: -90px;
  z-index: 10;
}

.endscreen-avatar {
  position: relative;
  width: 120px;
  border-radius: 60px;
  border: 2px solid gold;
}

#endscreen-scores-table {
  margin: 0 auto;
  font-size: 24px;
  background-color: #000000d1;
  border: 2px solid white;
  margin-top: 2rem;
}

#endscreen-scores-table td {
  padding: 10px 20px;
  border-bottom: 1px solid white;
}

#endscreen-scores-table th {
  padding: 10px 20px;
  font-weight: 800;
  border-bottom: 2px solid white;
}

.endscreen-score-name {
  text-align: left;
}

.endscreen-score-data {
  text-align: right;
}

#endscreen-techno-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100;
  pointer-events: none;
}

#endscreen-confetti-video {
  pointer-events: none;
  width: 100%;
  position: fixed;
  left: 0;
  top: 0;
}
</style>
