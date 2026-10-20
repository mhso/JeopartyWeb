<script setup lang="ts">
import { pageStrings } from "@shared/i18n";

const t = pageStrings("contestant/game");
</script>

<template>
  <h2 id="contestant-game-waiting">{{ t("waiting_for_start") }}</h2>
</template>
