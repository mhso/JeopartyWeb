import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "./stores/auth";

/**
 * Paths match the current Flask routes one-for-one so existing bookmarks and
 * the Playwright tests keep working. See the routing table in
 * API_BLUEPRINT.md for how Flask decides which HTML entry to serve.
 */
const routes: RouteRecordRaw[] = [
  {
    path: "/jeoparty/login",
    name: "login",
    component: () => import("./views/LoginView.vue"),
    meta: { public: true },
  },
  {
    path: "/jeoparty/",
    name: "home",
    component: () => import("./views/HomeView.vue"),
  },
  {
    path: "/jeoparty/create_game",
    name: "create-game",
    component: () => import("./views/CreateGameView.vue"),
  },
  {
    path: "/jeoparty/create_pack",
    name: "create-pack",
    component: () => import("./views/CreatePackView.vue"),
  },
  {
    path: "/jeoparty/pack/:packId",
    name: "pack",
    component: () => import("./views/PackEditorView.vue"),
    props: true,
  },
  {
    path: "/jeoparty/pack/:packId/cheatsheet",
    name: "cheatsheet",
    component: () => import("./views/CheatsheetView.vue"),
    props: true,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * Replaces `redirect_to_login(...)` at the top of every dashboard route.
 * One `GET /api/me`, cached in the store.
 */
router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  const auth = useAuthStore();
  if (!auth.resolved) await auth.fetchUser();

  if (!auth.user) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  return true;
});
