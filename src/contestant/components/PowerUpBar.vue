<script setup lang="ts">
/**
 * Replaces togglePowerUpsEnabled + the power_up_* handlers in
 * contestant_game.js, which reached for buttons by id and swapped classes.
 * The store owns `enabled`/`used`; this just binds to them.
 */
import { staticUrl } from "@shared/static";
import { useGameStore } from "../stores/game";

const store = useGameStore();
</script>

<template>
  <div id="contestant-power-ups">
    <button
      v-for="power in store.powerUps"
      :id="`contestant-power-btn-${power.type}`"
      :key="power.type"
      :disabled="!power.enabled || power.used"
      @click="store.usePowerUp(power.type)"
    >
      <img
        v-if="power.used"
        class="contestant-power-used"
        :src="staticUrl('img/forbidden.png')"
        alt="Used"
      />
      <img
        class="contestant-power-icon"
        :class="{ 'power-disabled': !power.enabled || power.used }"
        :src="staticUrl(power.icon)"
        :alt="power.type"
      />
    </button>
  </div>
</template>
