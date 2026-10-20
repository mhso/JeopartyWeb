import { defineStore } from "pinia";
import { ref } from "vue";

import { api, ApiError } from "@shared/api";
import type { AuthUser } from "@shared/types";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  /** False until the first /api/me has settled, so the guard doesn't flap. */
  const resolved = ref(false);
  const error = ref<string | null>(null);

  async function fetchUser(): Promise<void> {
    try {
      user.value = await api.me();
    } catch {
      user.value = null;
    } finally {
      resolved.value = true;
    }
  }

  async function login(username: string, password: string): Promise<boolean> {
    error.value = null;
    try {
      user.value = await api.login(username, password);
      resolved.value = true;
      return true;
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : "Could not log in";
      return false;
    }
  }

  async function signup(username: string, password: string): Promise<boolean> {
    error.value = null;
    try {
      user.value = await api.signup(username, password);
      resolved.value = true;
      return true;
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : "Could not sign up";
      return false;
    }
  }

  async function logout(): Promise<void> {
    await api.logout();
    user.value = null;
  }

  return { user, resolved, error, fetchUser, login, signup, logout };
});
