# Jeoparty — Vue frontend

Vue 3 + Vite replacement for the Flask/Jinja frontend in `../jeoparty`.

The backend stays where it is and keeps its game logic, ORM and socket layer;
it grows a JSON API and stops rendering HTML. See **[API_BLUEPRINT.md](API_BLUEPRINT.md)**
for the endpoint spec, the migration phases, and the design decisions behind
them.

## Layout

Three Vite entry points, not one SPA. The views never navigate to each other,
their stylesheets are disjoint, and contestants on phones should never download
the question-pack editor.

```
presenter.html    /jeoparty/presenter/<game_id>/{lobby,selection,question,finale,endscreen}
contestant.html   /jeoparty/<join_code>, /jeoparty/<game_id>/game, /jeoparty/kicked
dashboard.html    /jeoparty/, /login, /create_game, /create_pack, /pack/<id>

src/shared/       api client, typed socket, ORM-mirroring types, i18n, composables
src/presenter/    store (owns the socket) + flow state machine + views
src/contestant/   store (owns the socket) + stage components
src/dashboard/    auth store + pack editor store + views
```

The separation is real — the dashboard bundle contains no socket.io at all:

| Entry | JS (gzip) | CSS (gzip) |
|---|---|---|
| contestant | ~17 kB + vendor | 1.4 kB |
| presenter | ~7 kB + vendor | 3.6 kB |
| dashboard | ~7 kB + vendor | 4.2 kB |

## Running it

```bash
npm install
npm run dev        # http://localhost:5173/jeoparty/
```

The Flask app must be running on `:5006` (`cd ../jeoparty/src && pdm run main.py`).
Vite proxies `/jeoparty/api`, `/jeoparty/static` and `/socket.io` to it, so the
browser only ever sees one origin — which is what makes the cookie auth work
unchanged.

A small plugin in `vite.config.ts` (`entryFor`) maps page URLs to the right
entry HTML, so open the real paths — `/jeoparty/`, `/jeoparty/presenter/<id>/lobby`,
`/jeoparty/<join_code>` — not `/jeoparty/dashboard.html`.

```bash
npm run typecheck  # vue-tsc
npm run build      # -> dist/
```

To serve the build from Flask instead of the Jinja pages, start the backend with
`pdm run main.py --spa` and browse to `http://localhost:5006/jeoparty/`. It reads
`../jeoparty_web/dist` by default; set `JEOPARTY_FRONTEND_DIST` to point elsewhere.

## State of the port

| Area | Status |
|---|---|
| Shared: API client, typed socket, types, i18n, countdown, wake lock, action key | Done |
| Contestant: join, buzzer, power-ups, wagers, finale, game over | Done, needs the API behind it |
| Dashboard: auth, home, create game, create pack, cheatsheet | Done |
| Dashboard: pack editor | Store done; editing UI is Phase 2 |
| Presenter: shell, socket store, footer, countdown, theme overlays, lobby, selection, finale, endscreen | Skeleton |
| Presenter: question stage | Phase 3 — see the TODO block at the top of `QuestionView.vue` |

Phase 3 is the bulk of what's left, and it depends on the GET/POST split in
Phase 0 being in place first.

## Two things worth knowing before you read the code

**The socket is owned by a Pinia store and created once.** The old frontend tore
it down and rebuilt it on every stage change — `goToPage()` closed it, the next
page opened a fresh one, and contestants did the same via `location.reload()` on
`state_changed`. Keeping one connection for the session is most of the reason
this migration is worth doing. Components never call `socket.on`; handlers only
mutate the store.

**The presenter's keyboard flow is a state machine, not fifteen assignments to
`window.onkeydown`.** `usePresenterFlow` names the beats of a question and
derives the active key handlers from the current one; `useActionKey` binds them
in a single listener. Adding a beat means adding a case.
