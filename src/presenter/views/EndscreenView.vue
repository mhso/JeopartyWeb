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

const showTechnoOverlay = ref(false);
const avatarFlipped = ref(false);

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
      overlay.classList.add("d-none");
      endscreenMusic.pause();
      confettiVideo.pause();
      confettiVideo.classList.add("d-none");
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
    <video
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
