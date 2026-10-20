import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

/**
 * Contestant paths mirror the current Flask ones exactly, including the short
 * `/jeoparty/<join_code>` form -- that URL gets read aloud and typed into
 * phones from the presenter's lobby screen, so it stays short.
 *
 * The `:joinCode` route must be declared last; it is a catch-all in everything
 * but name.
 */
const routes: RouteRecordRaw[] = [
  {
    path: "/jeoparty/kicked",
    name: "kicked",
    component: () => import("./views/KickedView.vue"),
  },
  {
    path: "/jeoparty/nogame",
    name: "nogame",
    component: () => import("./views/NoGameView.vue"),
  },
  {
    path: "/jeoparty/:gameId/game",
    name: "game",
    component: () => import("./views/GameView.vue"),
    props: true,
  },
  {
    path: "/jeoparty/:joinCode",
    name: "join",
    component: () => import("./views/JoinView.vue"),
    props: true,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
