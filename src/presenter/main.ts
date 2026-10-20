import { createApp } from "vue";
import { createPinia } from "pinia";

import { i18n } from "@shared/i18n";
import { setUnauthorizedHandler } from "@shared/api";

import "@shared/styles/style.css";
import "@shared/styles/presenter_style.css";
import "@shared/styles/question_style.css";

import App from "./App.vue";
import { router } from "./router";

// The presenter lives in its own entry point, so bouncing to the login page
// means a real navigation into the dashboard bundle.
setUnauthorizedHandler(() => {
  const redirect = encodeURIComponent(window.location.pathname);
  window.location.href = `/jeoparty/login?redirect=${redirect}`;
});

const app = createApp(App).use(createPinia()).use(router).use(i18n);
router.isReady().then(() => app.mount("#app"));
