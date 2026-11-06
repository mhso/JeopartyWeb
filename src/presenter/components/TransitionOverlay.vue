<script setup lang="ts">
import { i18n } from "@shared/i18n";
import { useGameStore } from "../stores/game";

const store = useGameStore();
</script>

<template>
  <div v-if="store.showTransitionOverlay" id="transition-overlay">
    <div>
    <h2>{{ i18n.global.t('global.loading') }}...</h2>
    <svg
      version="1.1"
      id="play-icon"
      xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      x="0px"
      y="0px"
      viewBox="0 0 130 140"
      xml:space="preserve"
    >
      <path id="play-icon-path" d="M36.068,20.176l-29-20C6.761-0.035,6.363-0.057,6.035,0.114C5.706,0.287,5.5,0.627,5.5,0.999v40
      c0,0.372,0.206,0.713,0.535,0.886c0.146,0.076,0.306,0.114,0.465,0.114c0.199,0,0.397-0.06,0.568-0.177l29-20
      c0.271-0.187,0.432-0.494,0.432-0.823S36.338,20.363,36.068,20.176z M7.5,39.095V2.904l26.239,18.096L7.5,39.095z"/>
      <use href="#play-icon-path" x="45"></use>
      <use href="#play-icon-path" x="90"></use>
    </svg>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  0% {
    opacity: 0;
  }
  50% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

#transition-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #00000095;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 999;

  animation: fadeIn 2s linear;
  animation-fill-mode: forwards;
}

#transition-overlay > div {
  transition: opacity 0.5s;
  color: white;
  text-align: center;
  width: 50%;
  height: 60%;
}

#transition-overlay h2 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: white;
  font-size: 8rem;
  text-shadow: 3px 3px 3px rgb(42, 57, 212);
}

#transition-overlay svg {
  stroke: black;
  fill: white;
  width: 100%;
}

@keyframes svgFlash {
  0% {
    fill: white;
  }
  100% {
    fill: rgb(0, 110, 255);
  }
}

#transition-overlay svg path {
  animation: svgFlash 0.9s linear 0s infinite alternate both;
}

#transition-overlay svg use:nth-of-type(1) {
  animation: svgFlash 0.9s linear 0.3s infinite alternate both;
}

#transition-overlay svg use:nth-of-type(2) {
  animation: svgFlash 0.9s linear 0.6s infinite alternate both;
}
</style>
