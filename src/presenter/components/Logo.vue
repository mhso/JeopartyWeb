<script setup lang="ts">
import { staticUrl, themeAssetUrl } from "@shared/static";
import { useGameStore } from "../stores/game";

const store = useGameStore();

function logo() {
  let themeLogo = store.state?.theme?.logo;
  if (themeLogo) {
    return themeAssetUrl(`data/themes/${store.state?.theme?.id}`, themeLogo);
  }

  return staticUrl("img/logo.webp");
}
</script>

<template>
  <div id="logo-wrapper">
    <img
      id="jeopardy-logo"
      :src="logo()"
      alt="Jeoparty"
    />
  </div>
</template>