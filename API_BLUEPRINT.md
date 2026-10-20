# Jeoparty JSON API — Phase 0 blueprint

Spec for the JSON API that the Vue frontend consumes. This is **Phase 0** of the
migration: the endpoints below get added *alongside* the existing Jinja routes,
both work at once, and nothing is deleted until the corresponding view has been
ported.

Backend repo: `../jeoparty`. Frontend: this directory.

**Unchanged by this work:** `api/database.py`, `api/orm/models.py`,
`api/config.py`, `api/enums.py`, all of `mhooge_flask`, and the
`save_pack` / `_save_pack_files` / `_validate_pack_data` trio in `dashboard.py`.
Most route work is mechanical — swap `render_locale_template(...)` for
`make_json_response(...)` and keep the body.

---

## 0. Conventions

- **Prefix:** everything lives under `/jeoparty/api`.
- **Auth:** cookies, same-origin, sent automatically. Nothing to attach.
- **Errors:** `{"response": "<human readable>"}` with a real status code.
  `make_json_response` already produces this shape.
- **IDs:** always `id`. The current routes call `dump(id="game_id")` to rename
  the key so a game and its nested contestant can be flattened into one dict for
  Jinja. Nesting is free in JSON — drop the renaming.
- **Media paths:** stay relative to the static folder
  (`data/packs/<id>/x.png`, `img/check.png`). The frontend's `staticUrl()`
  resolves them. `/jeoparty/static/` keeps being served exactly as it is today.
- **No HTML in responses.** See §7.

---

## 1. The GET/POST split

This is the one change that makes an SPA possible, and it's worth being precise
about.

Four presenter routes currently **mutate game state from a GET**:

| Route | Side effects today |
|---|---|
| `GET /presenter/<id>/selection` | marks the previous question used + inactive, sets stage, **increments `game.round`**, picks daily doubles, resets power-ups, assigns the turn to the lowest scorer |
| `GET /presenter/<id>/question` | sets stage to `question`/`finale_question`, disables all power-ups, shuffles multiple-choice order |
| `GET /presenter/<id>/finale` | sets stage to `finale_result` |
| `GET /presenter/<id>/endscreen` | sets stage to `ended`, computes winners, POSTs to Int-Far |

It works today only because the presenter reaches them exactly once each, by
full page load. A refresh on `/selection` silently advances the round. An SPA
that refetches on reconnect would corrupt a game.

So each splits in two:

- **`GET /api/game/<id>/presenter-state`** — idempotent. Safe to call on mount,
  on reconnect, as often as you like.
- **`POST /api/game/<id>/advance/<target>`** — performs the transition, returns
  the new state in the same shape.

`<target>` ∈ `selection` | `question` | `finale_result` | `ended`. The server
still decides what a transition *means* (that logic moves across unchanged);
the client only says "go".

---

## 2. Auth

### `POST /api/login`
```jsonc
// request
{ "user": "presenter", "pass": "…" }
// 200 — sets the jeoparty_token cookie
{ "user_id": "7153…", "user_name": "presenter" }
// 401
{ "response": "Could not login: Username or Password does not match." }
```

Reuse `mhooge_flask.auth.login`'s body; return JSON instead of a redirect plus
a rendered template.

### `POST /api/signup`
Same shape. Wraps `auth.signup`.

### `GET /api/me`
`200` with `{user_id, user_name}`, or `401` if the cookie is absent or stale.
This is the router guard, and it replaces the `redirect_to_login(...)` prologue
on every dashboard route.

### `POST /api/logout`
Clears the cookie, `200`.

### Cookie hardening (recommended, small)

`routing.set_cookie` currently passes no flags:

```python
response.set_cookie(key, value, max_age, path=f"/{path}")
```

Add `httponly=True, samesite="Lax", secure=<not development>`. The frontend has
no reason to read either cookie and doesn't.

**Keep `path=/jeoparty`.** Serving the SPA from a different base path would stop
the cookie being sent, with no visible error.

### Contestant identity

`jeoparty_contestant_id` holds the contestant's raw UUID, and the socket
handlers take `user_id` as an *argument* and trust it — `_contestants_event`
only checks room membership. Any contestant in a game can currently emit
`buzzer_pressed(<someone else's id>)` or `make_finale_wager(<their id>, 9999)`.

Since the socket layer is being touched anyway:

1. Keep a `sid → contestant_id` map at join time (`contestant_metadata` already
   does the reverse).
2. Drop the `user_id` parameter from every `@_contestants_event` handler and
   resolve it from `flask.request.sid`.
3. Optionally sign the cookie, or store an opaque token that maps to the id.

Worth verifying `flask.request.cookies` is populated inside flask-socketio
handlers in this setup — if it is, the handshake can authenticate directly.
Not a blocker either way; the sid map alone closes the impersonation gap.

---

## 3. Dashboard

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/packs` | Adds `total_questions` per pack, as `home()` does today |
| `POST` | `/api/packs` | multipart (optional lobby music) → created pack |
| `GET` | `/api/packs/<id>` | Full nested pack. Keep the placeholder-finale-round shim from `question_pack()` |
| `POST` | `/api/packs/<id>/save` | **Unchanged.** Same multipart contract |
| `DELETE` | `/api/packs/<id>` | was `POST /pack/<id>/delete` |
| `GET` | `/api/packs/<id>/cheatsheet` | Nested rounds; the view renders it |
| `GET` | `/api/packs/fetch?url=` | **Unchanged.** CORS proxy for dropped media |
| `GET` | `/api/games` | `GameSummary[]`, see below |
| `POST` | `/api/games` | JSON in, created game out |
| `DELETE` | `/api/games/<id>` | was `POST /game/<id>/delete` |
| `GET` | `/api/themes` | `Theme[]` including the overlay manifest (§6) |

`GET /api/games` replaces the `url` field that `home()` built with `url_for`:

```jsonc
{
  "id": "…", "title": "Friday Quiz",
  "pack": { "id": "…", "name": "Test Pack" },
  "round": 2, "regular_rounds": 2,
  "question_num": 7, "total_questions": 25,
  "use_powerups": true, "stage": "selection",
  "contestant_count": 4, "max_contestants": 6,
  "started_at": "2026-01-04 20:11:03", "ended_at": null,
  "resume_path": "/jeoparty/presenter/<id>/selection"  // absent once ended
}
```

`resume_path` keeps the stage→route mapping (`finale_wager`→`selection`,
`finale_question`→`question`, `finale_result`→`finale`) on the server, where it
already lives.

### Pack save errors

`_get_error_data` returns a CSS selector in `element`
(`".question-choices-wrapper"`, `".question-choice-3"`). Change that to a
semantic `field` — `"choices"`, `"media"`, `"answer"`, `"question"` — plus the
existing `round_id` / `category_id` / `question_id`, and let the component
decide what to highlight. An API shouldn't know about class names.

---

## 4. Presenter

### `GET /api/game/<id>/presenter-state`

Auth: presenter cookie, and `game.created_by` must match — same checks as
`_request_decorator`, which also **lazily registers the socket.io namespace**.
Keep that here; it has to happen before the client's socket connects.

```jsonc
{
  "game": { /* Game, with nested game_contestants[] */ },
  "theme": { /* Theme | null, see §6 */ },
  "round_name": "Double Jeoparty!",
  "language": "danish",
  "question": { /* ActiveQuestion | null — only during question stages */ },
  "round":    { /* QuestionRound | null — board layout, selection stage only */ },
  "start_of_game": false,
  "correct_image": "img/check.png",
  "wrong_image": "img/error.png",
  "correct_sound": "data/sounds/correct_answer.mp3",
  "wrong_sounds": ["…", "…"],
  "media_sizes": { "small": 26, "default": 42, "maximized": 70 }
}
```

The sound and image picks stay server-side (`get_question_answer_sounds` /
`get_question_answer_images` already randomise per theme) so every client
agrees.

The `round` payload merges `GameQuestion` flags onto each question —
`active`, `used`, `daily_double` — exactly as `selection()` does now.

### `POST /api/game/<id>/advance/<target>`

Body: none. Returns the same `PresenterState` shape post-transition.

Move the bodies of `selection()`, `question()`, `finale()` and `endscreen()`
across as-is. Two notes:

- `selection` may determine the game is over (no finale, last round done). It
  should return the resulting state with `stage: "ended"` rather than
  redirecting, and let the client route.
- `endscreen`'s Int-Far POST stays. Note `_get_intfar_request_params()` is
  called with no arguments there but takes a `config` parameter — that's a live
  `TypeError` on the LAN path today, worth fixing while you're in the file.

---

## 5. Contestant

### `GET /api/lobby/<join_code>` — public, no auth

Feeds the join form. Must not leak the password or the question set.

```jsonc
{
  "game_id": "…", "join_code": "fridays_game", "title": "Friday Quiz",
  "has_password": true, "language": "danish",
  "full": false, "ended": false,
  "existing": { "name": "Dave", "color": "#aa3311", "avatar": "img/avatars/….png" },
  "default_avatar": "img/avatars/questionmark.png"
}
```

`existing` is populated from the cookie when this browser has joined before, so
returning players keep their name and colour. `404` if the code is unknown —
the frontend routes to the "no game" view.

### `POST /api/contestant/join` — multipart

Fields: `join_code`, `name`, `color`, optional `password`, and either an
`avatar` file or `default_avatar=1`. Optional `buzz_sound` / `bg_image` for the
LAN flow.

```jsonc
// 200 — sets the jeoparty_contestant_id cookie
{ "game_id": "…", "contestant_id": "…" }
// 400 / 403 / 409
{ "response": "Lobby is full" }
```

Keep the `JOIN_LOCK` critical section verbatim — it's what stops two phones
racing into the last slot. The only change is returning JSON instead of
`flask.redirect(url_for(...))` for each failure case.

### `GET /api/game/<id>/contestant-state`

Auth: contestant cookie; `401` if missing, `403` if they haven't joined this
game.

Return only what a phone needs, and **never the answer**. `game_view` currently
passes the full question dump (answer included) into the template context, but
`contestant/game.html` only interpolates specific fields, so nothing leaks
today — the protection is "the template happens not to print it". Make it
structural by not sending the field at all. The finale is the one case where
the phone legitimately shows the prompt (`question.question`), so include that
only for `finale_question`.

```jsonc
{
  "game": { "id": "…", "stage": "question", "round": 2, "total_rounds": 3,
            "question_num": 7, "max_value": 1000, "title": "Friday Quiz" },
  "me": { /* Contestant, with power_ups[] */ },
  "question": { "id": "…", "value": 600, "daily_double": false,
                "category": { "id": "…", "name": "Geography" } },
  "player_with_turn": { "id": "…", "name": "Dave", "color": "#aa3311" },
  "num_questions_in_round": 25,
  "round_name": "Double Jeoparty!",
  "language": "danish",
  "start_of_game": false,
  "winner": false          // only once stage is "ended"
}
```

---

## 6. Themes

Themes are Jinja fragments today — `app/templates/themes/<id>/{lobby,selection,question,global}.html`
— pulled in per stage with `{% include %}` and containing `<style>`, `<video>`
and `<script>`. Vue can't include them, and `v-html` won't run their scripts.

They become a **declarative manifest** served from `GET /api/themes`:

```jsonc
{
  "id": "5d374837-…", "name": "Jul", "language": "danish", "public": false,
  "data_path": "data/themes/5d374837-…",
  "bg_image": "data/themes/…/presenter_background.jpg",
  "logo": "data/themes/…/logo.webp",
  "overlays": [
    { "stage": "lobby", "type": "video", "src": "snow.webm",
      "loop": true, "muted": true, "autoplay": true,
      "css": { "position": "fixed", "top": 0, "left": 0, "width": "100vw", "zIndex": 90 } },

    { "stage": "selection", "when": "not_start_of_game", "type": "video",
      "src": "fireplace.mp4", "loop": true, "muted": true, "autoplay": true,
      "css": { "position": "fixed", "zIndex": -1, "filter": "blur(3px) brightness(0.75)" } },

    { "stage": "selection", "when": "start_of_game", "type": "intro",
      "src": "intro_video.webm", "volume": 0.9, "delayMs": 39000 }
  ],
  "css": "/* optional raw CSS, injected as a <style> tag */"
}
```

Both existing themes fit this. The only `<script>` in either set a video's
volume and hid it on `ended` — that's what the `intro` type does.

`ThemeOverlay.vue` renders it. Raw CSS is allowed as an escape hatch; raw HTML
and JS are not.

**Migration:** hand-convert the two existing themes. Store the manifest as a
`theme.json` in the theme's data folder, or add a JSON column to the `themes`
table — the former needs no migration and matches how theme assets already work.

---

## 7. Stop returning HTML

Two endpoints build markup in Python:

`endscreen()` assembles `winner_desc` by interpolating contestant names and
colours into `<span style="color: {{ color }}; font-weight: 800">`, rendered
under `{% autoescape false %}`.

Not exploitable as-is: `Contestant.__validate_fields__` constrains `name` to
`^[a-zA-Z0-9æøåÆØÅ_\-' ]*$`, which excludes angle brackets. But the escaping
depends entirely on a validation rule in a different file continuing to hold,
and `color` has **no** validation entry at all — it's a free-form 16-char string
dropped straight into a `style` attribute, so CSS injection is available to
anyone who crafts the join POST rather than using the colour picker. Worth
adding a hex pattern to `color` regardless of this migration.

Returning structured data removes the whole category:

```jsonc
{ "winners": [{ "id": "…", "name": "Dave", "color": "#aa3311", "avatar": "…" }],
  "tied": false }
```

`finale()` preformats `wager` and `answer` into display strings, including the
locale's word for "nothing". Return the raw `finale_wager` / `finale_answer`;
formatting is a view concern and the locale now lives client-side.

---

## 8. Serving the frontend

`vite build` emits three entries into `dist/`. Flask serves them, so everything
stays on one origin and both cookies keep working.

Route the SPA entries by prefix, most specific first:

| Path | Serves |
|---|---|
| `/jeoparty/api/…` | the API |
| `/jeoparty/static/…` | unchanged static folder |
| `/jeoparty/presenter/…` | `presenter.html` |
| `/jeoparty/`, `/login`, `/create_game`, `/create_pack`, `/pack/<id>`, `/pack/<id>/cheatsheet` | `dashboard.html` |
| anything else under `/jeoparty/` | `contestant.html` |

The contestant catch-all is last on purpose: `/jeoparty/<join_code>` needs to
stay short because it gets read aloud from the lobby screen and typed into
phones. Werkzeug already ranks static rules above dynamic ones, which is why
`/jeoparty/create_game` doesn't currently resolve as a join code — same
principle, made explicit.

In development, Vite proxies `/jeoparty/api`, `/jeoparty/static` and
`/socket.io` (with `ws: true`) to `:5006`, so the browser only ever sees one
origin. Don't rely on the existing `CORS(app)` / `cors_allowed_origins="*"` —
wildcard CORS doesn't work with credentialed requests.

---

## 9. Socket changes

`socket.py` is *almost* untouched. Event names and payloads stay as they are —
they're already typed in `src/shared/socket.ts`, transcribed from the handlers.

### The join handshake must change

`on_contestant_join` currently **sleeps up to 20 seconds** polling
`game_metadata.setup_complete`:

```python
while (self.game_metadata.setup_complete is not None
       and not self.game_metadata.setup_complete
       and time_slept < timeout):
    time_slept += sleep_delta
    sleep(sleep_delta)
```

That exists because contestants reload on every stage change and must not
rejoin before the presenter's new page has finished loading. With persistent
sockets on both ends, nobody reloads and there's nothing to wait for.

Replace with: presenter emits `stage_ready` once the new stage has rendered →
server broadcasts `state_changed` → contestants refetch. Then delete the sleep
loop, the `joined` reset in `on_setup_complete`, and `contestant_join_timeout`.

**This is a flag-day change.** Presenter and contestants must agree on the new
protocol simultaneously, so it lands with Phase 3, not before.

### Namespace registration

`get_namespace_handler` is called from `_request_decorator` on every presenter
page load. Move it into `GET /api/game/<id>/presenter-state` so the namespace
exists before the socket connects.

---

## 10. Phase order

| Phase | Scope | Gate |
|---|---|---|
| **0** | This document. JSON API alongside Jinja. No frontend. | `curl` each endpoint |
| **1** | Contestant view | Real phone on the LAN, full game end to end |
| **2** | Dashboard + pack editor | Create a pack, save with media, start a game |
| **3** | Presenter, stage by stage: lobby → selection → question → finale → endscreen. Socket handshake change lands here. | Full game with 4 contestants |
| **4** | Delete `templates/`, delete old JS, Flask serves `dist/`, update Playwright, drop jQuery | Test suite green |

Phase 3 depends on Phase 0's GET/POST split being right. Phases 1 and 2 are
independent of each other.

### Tests

`tests/browser_context.py` drives real selectors and asserts on screenshots, so
every test file needs selector updates. Add `data-testid` attributes as
components are built and update tests **per phase** — leaving it to Phase 4
means debugging a dozen broken tests at once with no known-good baseline.
