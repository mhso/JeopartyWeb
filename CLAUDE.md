# Overview
This is a port of a Flask + HTML + JS + CSS quiz website called Jeoparty. The new project reuses much of the old Flask API (see API_BLUEPRINT.md), but replaces the frontend with a Vue web app.

The backend API is located in `../jeoparty/src/jeoparty/routes/api`.

The backend uses a custom library called `mhooge_flask` located in `../scripts/mhooge_flask`

The old frontend code is located in `../jeoparty/src/jeoparty/app`.

Styles are global for now, with one sheet per app, located in `shared/styles`.

## Where new and old files are located
### Contestant app

#### views/LobbyView.vue
* Jinja HTML template: `templates/contestant/lobby.html`
* JavaScript: `static/js/contestant_lobby.js`

#### views/GameView.vue
* Jinja HTML template: `templates/contestant/game.html`
* JavaScript: `static/js/contestant_game.js`

### Dashboard app
#### views/CheatsheetView
* Jinja HTML template: `templates/dashboard/cheatsheet.html`

#### views/CreateGameView
* Jinja HTML template: `templates/dashboard/create_game.html`
* JavaScript: `static/js/dashboard.js`

#### views/CreatePackView
* Jinja HTML template: `templates/dashboard/create_pack.html`
* JavaScript: `static/js/dashboard.js`

#### views/HomeView
* Jinja HTML template: `templates/dashboard/home.html`
* JavaScript: `static/js/dashboard.js`

#### views/LoginView
* Jinja HTML template: `templates/login.html`

#### views/PackEditorView
* Jinja HTML template: `templates/dashboard/question_pack.html`
* JavaScript: `static/js/question_pack.js`

### Presenter app
#### views/EndscreenView
* Jinja HTML template: `templates/presenter/endscreen.html`

#### views/FinaleView
* Jinja HTML template: `templates/presenter/finale.html`
* JavaScript: `static/js/presenter.js`

#### views/LobbyView
* Jinja HTML template: `templates/presenter/lobby.html`
* JavaScript: `static/js/presenter.js`

#### views/QuestionView
* Jinja HTML templates: `templates/presenter/question.html` and `templates/question_view.html`
* JavaScript: `static/js/presenter.js`

#### views/SelectionView
* Jinja HTML templates: `templates/presenter/selection.html`
* JavaScript: `static/js/presenter.js`

### Socket logic
* Sockets were previously loaded in `templates/contestant/head.html` and `templates/presenter/head.html`, now defined in `shared/socket.ts`
* Backend socket handling is defined in `routes/api/socket.py`

# State of the port
| Area | Status |
|---|---|
| Shared: API client, typed socket, types, i18n, countdown, wake lock, action key | Done |
| Contestant: join, buzzer, power-ups, wagers, finale, game over | Done |
| Dashboard: auth, home, create game, create pack, cheatsheet | Done |
| Dashboard: pack editor | Store done; editing UI is Phase 2 |
| Presenter: shell, lobby, selection | Done |
| Presenter: shell, socket store, footer, countdown, theme overlays, finale, endscreen | Skeleton |
| Presenter: question stage | Implemented (`usePresenterFlow.ts` + `QuestionView.vue`), not yet tested in a live game |

Phase 3 is the bulk of what's left and the most crucial to get right.