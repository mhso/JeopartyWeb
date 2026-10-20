import { createApp } from "vue";
import { createPinia } from "pinia";

import { i18n } from "@shared/i18n";

import "@shared/styles/style.css";
import "@shared/styles/contestant_style.css";

import App from "./App.vue";
import { router } from "./router";

const app = createApp(App).use(createPinia()).use(router).use(i18n);
router.isReady().then(() => app.mount("#app"));
