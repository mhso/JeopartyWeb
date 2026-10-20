# Stylesheets

These are copied verbatim from `jeoparty/src/jeoparty/app/static/css/`.

**Do not rewrite them during the port.** Each entry point imports the sheets it
needs as globals, and the Vue components keep the existing class names
(`footer-contestant-entry`, `question-countdown-filled`, and so on). Porting
markup and restyling at the same time is how these migrations stall — get the
components rendering against the styles that already work, then scope things to
components incrementally afterwards.

| File | Used by |
|---|---|
| `style.css` | all three (resets, `.d-none`, `.bg-fill`) |
| `dashboard_style.css` | dashboard |
| `presenter_style.css` | presenter |
| `question_style.css` | presenter (question stage) and the pack editor |
| `contestant_style.css` | contestant |

One thing to watch: `.d-none` is load-bearing in the original JS, which toggles
it to show and hide almost everything. In Vue that work belongs to `v-if` /
`v-show`, so expect `.d-none` usage to disappear from the markup even though
the rule itself stays for the styles that rely on it.
