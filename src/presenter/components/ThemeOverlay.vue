<script setup lang="ts">
/**
 * Renders a theme's decorative overlays for the current stage.
 *
 * Replaces the `{% include theme['template_path'] + '/<stage>.html' %}` blocks
 * in the presenter templates. Those fragments were raw Jinja containing
 * <style>, <video> and <script>; Vue cannot include them and v-html will not
 * run their scripts, so themes are declarative now -- see ThemeOverlay in
 * shared/types.ts and the migration note in API_BLUEPRINT.md.
 *
 * Both existing themes ("Jul", "LAN") fit this shape. The only script in either
 * set a video's volume and hid it on end, which the "intro" type covers.
 */
import { computed } from "vue";

import { themeAssetUrl } from "@shared/static";
import type { StageType, ThemeOverlay, StyleOverlay } from "@shared/types";

import { useGameStore } from "../stores/game";

const props = defineProps<{ stage: StageType }>();
const store = useGameStore();

const theme = computed(() => store.state?.theme ?? null);
const dataPath = computed(() => `data/themes/${theme?.value?.id}`);

const overlays = computed<ThemeOverlay[]>(() => {
  const all = theme.value?.overlays ?? [];
  const startOfGame = store.state?.start_of_game ?? false;
  return all.filter((overlay) => {
    if (overlay.stage != null && overlay.stage !== props.stage) return false;
    if (overlay.when === "start_of_game" && !startOfGame) return false;
    if (overlay.when === "not_start_of_game" && startOfGame) return false;
    return true;
  });
});

function toCssText(rules: Record<string, Record<string, string | number>>): string {
  return Object.entries(rules)
    .map(([selector, declarations]) => {
      const body = Object.entries(declarations)
        // Allow camelCase keys too, matching what :style accepts
        .map(([prop, value]) => `${prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`)
        .join(" ");
      return `${selector} { ${body} }`;
    })
    .join("\n");
}

const overlayCss = computed(() =>
  overlays.value
    .filter((o): o is StyleOverlay => o.type === "style" && !!o.css)
    .map((o) => toCssText(o.css!))
    .join("\n")
);

function src(overlay: ThemeOverlay): string {
  return overlay.src ? themeAssetUrl(dataPath.value, overlay.src) : "";
}

function onIntroEnded(event: Event): void {
  (event.target as HTMLVideoElement).style.display = "none";
}
</script>

<template>
  <template v-if="theme">
    <!-- eslint-disable-next-line vue/no-v-html -- theme CSS only, never markup -->
    <component :is="'style'" v-if="theme.css" v-text="theme.css" />
    <component :is="'style'" v-if="overlayCss" v-text="overlayCss" />

    <template v-for="(overlay, index) in overlays" :key="`${overlay.stage}-${index}`">
      <img v-if="overlay.type === 'image'" :src="src(overlay)" :style="overlay.css" alt="" />
      <video
        v-else-if="overlay.type === 'video' || overlay.type === 'intro'"
        :src="src(overlay)"
        :style="overlay.css"
        :loop="overlay.loop"
        :muted="overlay.muted"
        :autoplay="overlay.autoplay"
        :volume="overlay.volume"
        @ended="overlay.type === 'intro' && onIntroEnded($event)"
      />
  
      <!-- "style" handled separately, e.g. compiled into a <style> block -->
    </template>
  </template>
</template>
