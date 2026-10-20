<script setup lang="ts">
/** Ports templates/logo.html. Theme logos override the default when set. */
import { staticUrl } from "@shared/static";

const props = defineProps<{ themeLogo?: string | null }>();
const src = () => staticUrl(props.themeLogo ?? "img/logo.webp");
</script>

<template>
  <div id="logo-wrapper">
    <RouterLink to="/jeoparty/">
      <img id="jeopardy-logo" :src="src()" alt="Jeoparty" />
    </RouterLink>
  </div>
</template>
