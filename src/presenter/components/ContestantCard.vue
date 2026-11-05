<script setup lang="ts">
/**
 * One contestant in the footer strip.
 *
 * Also absorbs `setContestantTextSizeAndColors` from presenter.js, which
 * measured the DOM to pick a contrasting text colour and scale the name to
 * fit. The colour is a pure function of the background, so it's a computed;
 * the font size uses the same formula but no longer needs a reflow.
 */
import { computed, reactive, ref, watch } from "vue";

import { staticUrl } from "@shared/static";
import type { Contestant } from "@shared/types";

import { useGameStore } from "../stores/game";

const props = defineProps<{ contestant: Contestant; pointsLabel: string }>();
const store = useGameStore();

const editing = ref(false);
const hovered = ref(false);

/** Perceived-luminance test, same weights as the original. */
const textColor = computed(() => {
  const hex = props.contestant.color.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) || 0);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? "black" : "white";
});

/** Long names shrink to fit -- the original's `120 - length * 3.3` percentage. */
const nameFontSize = computed(
  () => `${Math.round(Math.max(120 - props.contestant.name.length * 3.3, 45))}%`,
);

/**
 * presenter.js `triggerScoreUpdateAnimation`: the score pulses on change,
 * bigger for bigger swings, green up / red down. Duration matches the 2s
 * `animation-duration` on `.footer-contestant-entry-score`.
 */
const scoreAnimation = ref<{ name: string; className: string } | null>(null);
let scoreAnimationTimer: number | null = null;

watch(
  () => props.contestant.score,
  (score, previous) => {
    const delta = score - previous;
    if (!delta) return;

    const size = Math.abs(delta);
    const name =
      size < 500
        ? "scoreUpdatedSmall"
        : size < 1000
          ? "scoreUpdatedMedium"
          : size < 1500
            ? "scoreUpdatedLarge"
            : "scoreUpdatedHuge";

    // Clear first so a second change mid-animation restarts it.
    scoreAnimation.value = null;
    if (scoreAnimationTimer !== null) clearTimeout(scoreAnimationTimer);
    requestAnimationFrame(() => {
      scoreAnimation.value = {
        name,
        className: `score-animation-${delta >= 0 ? "correct" : "wrong"}`,
      };
      scoreAnimationTimer = window.setTimeout(() => (scoreAnimation.value = null), 2000);
    });
  },
);

/**
 * Edited values live here until saved. `contenteditable` can't take a
 * `v-model`, so the fields push their text into this on `@input`, and the
 * contestant prop (which belongs to the store) stays untouched until the
 * server sends back the update.
 */
const draft = reactive({
  hits: 0,
  misses: 0,
  score: 0,
  powers: {} as Record<string, boolean>,
});

/** Parse an edited field, keeping the previous value if it isn't a number. */
function readNumber(event: Event, fallback: number): number {
  const value = Number.parseInt((event.target as HTMLElement).textContent ?? "", 10);
  return Number.isNaN(value) ? fallback : value;
}

function toggleEdit(): void {
  if (editing.value) {
    store.emit.editContestant({
      id: props.contestant.id,
      hits: draft.hits,
      misses: draft.misses,
      score: draft.score,
      powers: { ...draft.powers },
    });
  } else {
    draft.hits = props.contestant.hits;
    draft.misses = props.contestant.misses;
    draft.score = props.contestant.score;
    draft.powers = Object.fromEntries(props.contestant.power_ups.map((p) => [p.type, p.used]));
  }
  editing.value = !editing.value;
}

function remove(): void {
  if (confirm("Are you sure you want to kick this contestant?")) {
    store.emit.removeContestant(props.contestant.id);
  }
}
</script>

<template>
  <div
    class="footer-contestant-entry"
    :class="[{ 'active-contestant-entry': store.isHighlighted(contestant.id) }, `footer-contestant-${contestant.id}`]"
    :style="{ backgroundColor: contestant.color, color: textColor }"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <div class="footer-contestant-buzzes">
      <!--
        Keyed on `editing` so the element is rebuilt on save: typing into a
        contenteditable can replace the text node Vue patches, leaving later
        updates pointed at a detached node.
      -->
      <div
        :key="`hits-${editing}`"
        class="footer-contestant-entry-hits"
        :contenteditable="editing"
        @input="draft.hits = readNumber($event, draft.hits)"
      >
        {{ contestant.hits }}
      </div>
      <div
        :key="`misses-${editing}`"
        class="footer-contestant-entry-misses"
        :contenteditable="editing"
        @input="draft.misses = readNumber($event, draft.misses)"
      >
        {{ contestant.misses }}
      </div>
    </div>

    <div class="footer-contestant-header">
      <div class="footer-contestant-entry-name" :style="{ fontSize: nameFontSize }">
        {{ contestant.name }}
      </div>
      <div
        :key="`score-${editing}`"
        class="footer-contestant-entry-score"
        :class="scoreAnimation?.className"
        :style="{ animationName: scoreAnimation?.name ?? 'none' }"
        :contenteditable="editing"
        @input="draft.score = readNumber($event, draft.score)"
      >
        {{ contestant.score }} {{ pointsLabel }}
      </div>
    </div>

    <img class="footer-contestant-entry-avatar" :src="staticUrl(contestant.avatar)" alt="" />

    <img
      v-show="store.buzzEmojis.has(contestant.id)"
      class="footer-contestant-entry-buzz-emoji footer-contestant-icon-overlay flash"
      :src="staticUrl(`img/${store.buzzEmojis.get(contestant.id)}.png`)"
      :key="store.buzzEmojis.get(contestant.id)"
      alt=""
    />

    <img
      v-if="store.readyContestants.has(contestant.id)"
      class="footer-contestant-entry-ready footer-contestant-icon-overlay"
      :src="staticUrl('img/check.png')"
      alt="Ready"
    />

    <img
      v-if="contestant.disconnected"
      class="footer-contestant-entry-disconnected footer-contestant-icon-overlay"
      :src="staticUrl('img/disconnected.png')"
      alt="Disconnected"
    />

    <button v-if="editing" class="footer-contestant-remove-btn" @click="remove">&times;</button>

    <button
      v-if="hovered || editing"
      class="footer-contestant-edit-btn footer-contestant-icon-overlay"
      @click="toggleEdit"
    >
      <img :src="staticUrl(editing ? 'img/save.png' : 'img/edit.png')" alt="Edit" />
    </button>

    <div class="footer-contestant-entry-powers">
      <div
        v-for="power in contestant.power_ups"
        :key="power.type"
        :class="`footer-contestant-power-${power.type}`"
        @click="editing && (draft.powers[power.type] = !draft.powers[power.type])"
      >
        <img
          v-if="editing ? draft.powers[power.type] : power.used"
          class="footer-contestant-entry-power-used"
          :src="staticUrl('img/forbidden.png')"
          alt="Used"
        />
        <img
          class="footer-contestant-entry-power-icon"
          :src="staticUrl(power.icon)"
          :alt="power.type"
        />
      </div>
    </div>
  </div>
</template>
