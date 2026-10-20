/**
 * Locale handling, moved off the server.
 *
 * The Jinja version injected a `_locale` dict per page via
 * `render_locale_template`, which merged the page's own strings with the
 * "global" ones. The locale JSON is small (~4KB each), so it ships in the
 * bundle instead and the merge happens here.
 *
 * These files are copied from resources/locales/. Keep them in sync -- or, once
 * the migration lands, move them here for good and drop the `locales=` kwarg
 * from create_app() in main.py.
 */

import { createI18n } from "vue-i18n";
import type { Language } from "./types";

import danish from "./locales/danish.json";
import english from "./locales/english.json";

type LocaleFile = { pages: Record<string, Record<string, string>> };

const FILES: Record<Language, LocaleFile> = {
  danish: danish as LocaleFile,
  english: english as LocaleFile,
};

/**
 * Flattens one locale file into vue-i18n messages keyed by page, with the
 * "global" strings merged into every page -- matching `get_locale_data`.
 */
function buildMessages(file: LocaleFile): Record<string, Record<string, string>> {
  const global = file.pages.global ?? {};
  const out: Record<string, Record<string, string>> = {};
  for (const [page, strings] of Object.entries(file.pages)) {
    out[page] = { ...global, ...strings };
  }
  return out;
}

export const i18n = createI18n({
  legacy: false,
  locale: "english" satisfies Language,
  fallbackLocale: "english" satisfies Language,
  messages: {
    danish: buildMessages(FILES.danish),
    english: buildMessages(FILES.english),
  },
});

/**
 * The active language follows the question pack, not the browser -- a Danish
 * pack shows Danish strings to everyone in the game.
 */
export function setLanguage(language: Language): void {
  i18n.global.locale.value = language;
}

/**
 * Scoped accessor for one page's strings, so components can write `t("points")`
 * rather than `t("contestant/game.points")`.
 */
export function pageStrings(page: string): (key: string) => string {
  return (key: string) => i18n.global.t(`${page}.${key}`);
}
