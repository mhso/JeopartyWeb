<script setup lang="ts">
/**
 * Ports templates/login.html and routes/login.py.
 *
 * The server no longer redirects; it sets the cookie and returns JSON, and the
 * router handles where to go next via the `redirect` query param.
 */
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const username = ref("");
const password = ref("");
const busy = ref(false);

async function submit(signup = false): Promise<void> {
  busy.value = true;
  const ok = signup
    ? await auth.signup(username.value, password.value)
    : await auth.login(username.value, password.value);
  busy.value = false;

  if (ok) {
    const redirect = route.query.redirect;
    await router.replace(typeof redirect === "string" && redirect ? redirect : "/jeoparty/");
  }
}
</script>

<template>
  <div id="login-wrapper">
    <h1>Log in</h1>

    <form @submit.prevent="submit(false)">
      <div class="input-field">
        <label for="user">Username</label>
        <input id="user" v-model="username" name="user" autocomplete="username" required />
      </div>

      <div class="input-field">
        <label for="pass">Password</label>
        <input
          id="pass"
          v-model="password"
          name="pass"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>

      <input type="submit" class="default-button" value="Log in" :disabled="busy" />
      <button type="button" class="default-button" :disabled="busy" @click="submit(true)">
        Sign up
      </button>
    </form>

    <p v-if="auth.error" id="dashboard-form-error">{{ auth.error }}</p>
  </div>
</template>
