import { createApp } from "vue";
import { createPinia } from "pinia";

import { i18n } from "@shared/i18n";
import { setUnauthorizedHandler } from "@shared/api";

import "@shared/styles/style.css";
import "@shared/styles/dashboard_style.css";
import "@shared/styles/question_style.css";

import App from "./App.vue";
import { router } from "./router";

setUnauthorizedHandler(() => {
  void router.push({ name: "login", query: { redirect: router.currentRoute.value.fullPath } });
});

const app = createApp(App).use(createPinia()).use(router).use(i18n);
router.isReady().then(() => app.mount("#app"));
