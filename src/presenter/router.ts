import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

/**
 * One route per stage, same as the old Flask endpoints -- but navigating here
 * is purely a view change. The state transition happens first, via
 * `POST /api/game/<id>/advance/<stage>`; see the store.
 *
 * `/jeoparty/presenter/<id>` used to be the lobby. It redirects now so old
 * links keep working.
 */
const routes: RouteRecordRaw[] = [
  {
    path: "/jeoparty/presenter/:gameId",
    redirect: (to) => `/jeoparty/presenter/${to.params.gameId}/lobby`,
  },
  {
    path: "/jeoparty/presenter/:gameId/lobby",
    name: "lobby",
    component: () => import("./views/LobbyView.vue"),
    props: true,
  },
  {
    path: "/jeoparty/presenter/:gameId/selection",
    name: "selection",
    component: () => import("./views/SelectionView.vue"),
    props: true,
  },
  {
    path: "/jeoparty/presenter/:gameId/question",
    name: "question",
    component: () => import("./views/QuestionView.vue"),
    props: true,
  },
  {
    path: "/jeoparty/presenter/:gameId/finale",
    name: "finale",
    component: () => import("./views/FinaleView.vue"),
    props: true,
  },
  {
    path: "/jeoparty/presenter/:gameId/endscreen",
    name: "endscreen",
    component: () => import("./views/EndscreenView.vue"),
    props: true,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
