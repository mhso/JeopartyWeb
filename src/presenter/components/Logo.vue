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

<style scoped src="@shared/styles/logo.css"></style>

<style scoped>
#logo-wrapper {
  margin: 0 auto;
  text-align: center;
}

#jeopardy-logo {
  margin-top: -10px;
  filter: drop-shadow(0 5px 5px black);
}
</style>
