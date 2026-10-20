<script setup lang="ts">
/** Ports templates/contestant/kicked.html. */
import { staticUrl } from "@shared/static";
</script>

<template>
  <div class="bg-fill" />
  <div id="logo-wrapper">
    <img id="jeopardy-logo" :src="staticUrl('img/logo.webp')" alt="Jeoparty" />
  </div>
  <h2 style="color: white; text-align: center">You have been kicked :(</h2>
</template>
