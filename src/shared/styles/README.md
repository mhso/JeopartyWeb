# Stylesheets

Styles live in the components they belong to, as `<style scoped>` blocks. This
folder and the `styles/` folders next to each app only hold what scoping can't
own by itself:

| File | Used by |
|---|---|
| `src/shared/styles/style.css` | all three entry points, global (`body` background) |
| `src/shared/styles/bg_fill.css` | `.bg-fill`, anywhere a background is drawn |
| `src/shared/styles/logo.css` | `#logo-wrapper`, the logo in all three apps |
| `src/shared/styles/flash.css` | `.flash`, contestant buzzer and presenter footer |
| `src/shared/styles/question_stage.css` | `QuestionView` and `QuestionEditor` |
| `src/shared/styles/question_choices.css` | `QuestionView` and `AnswerChoices` |
| `src/shared/styles/question_countdown.css` | `CountdownBar` and `QuestionEditor` |
| `src/contestant/styles/*.css` | rules shared by the contestant stage components |
| `src/dashboard/styles/*.css` | form controls and errors shared by dashboard components |

A rule used by more than one component goes in a fragment, which each component
pulls in with `<style scoped src="...">`. The fragment is compiled once per
component, under that component's scope, so list the fragments before the
component's own block: the order of the blocks is the order of the cascade.

Base element rules (`h1`, `p`, `body`) go in an unscoped `<style>` in the app's
`App.vue`.

Three things to watch:

- **Keyframes named from JS must be unscoped.** Scoping hashes keyframe names
  and only rewrites `animation` declarations in the same block, so an inline
  `animationName` would point at nothing. This is why `dailyDouble`,
  `scoreUpdated*` and `popup-animate` sit in unscoped blocks.
- **Scoped rules stop at the component boundary.** A parent's rule reaches a
  child's root element only. Use `:deep()` to go further, and `:slotted()` for
  slot content from the child's side. `v-html` content needs `:deep()` too.
- **Scoping raises specificity.** A theme's raw CSS is global, so to override a
  scoped rule it needs a more specific selector or `!important`.
