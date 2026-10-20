<script setup lang="ts">
/** Ports templates/contestant/nogame.html. */
import { staticUrl } from "@shared/static";
</script>

<template>
  <div class="bg-fill" />
  <div id="logo-wrapper">
    <img id="jeopardy-logo" :src="staticUrl('img/logo.webp')" alt="Jeoparty" />
  </div>
  <h2 style="color: white; text-align: center">
    A game with that code does not seem to exist, maybe you typed it wrong?
  </h2>
</template>
