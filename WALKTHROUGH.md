# How Miss Angie works

There are two halves:
- **The server** (`server/`) remembers everything and talks to Claude.
- **The app** (`public/`) is what your mom sees and taps.

They talk over a small API, which is just URLs that start with `/api/`.

Every file is split into named sections, like your Three.js files: `IMPORTS`, `CONFIG`, `STATE`, `UTILITIES`, `OBJECTS`, `DRAW`, `PULSE` and `INIT`. When you're looking for something, look for its section first.

```
phone ──taps──▶ public/js (the app) ──fetch /api/...──▶ server/index.js
                                                          │
                                   ┌──────────────────────┼──────────────────────┐
                                   ▼                      ▼                      ▼
                              server/db.js          server/angie.js        server/haiku.js
                         (SQLite: her memory)     (Claude + her tools)   (the daily haiku)
                                   ▲
                    server/scheduler.js runs every minute
                    (Sunday check-in, reminders, haiku prep)
```

---

## The server

### `db.js`: her memory
- One SQLite file holds everything, with one table per kind of thing:
  - **People and plans:** `members`, `events`
  - **Food:** `fridge`, `groceries`, `meals`
  - **Angie's work:** `decisions`, `reminders`, `messages`
  - **Poetry:** `haiku`, `haiku_views`
- **Settings** (her profile, Angie's preferences, location) are saved as small JSON blobs in a `settings` table, with sensible defaults.
- **The date helpers** (`isoDate`, `addDays`) always use *local* time, so "today" means her today.

### `index.js`: the front door
- **Login:**
  - She types the passcode once, and the server gives her browser a signed cookie.
  - Every `/api` route checks that cookie first.
  - It's one passcode for one person. Simple on purpose.
- **`GET /api/state`:**
  - Returns *everything* the screens need in one go: profile, family, events, fridge, groceries, meals, decisions, reminders and the last 60 messages.
  - The app calls it after every change and redraws. That's slower than being clever, but much easier to understand, and for one user it's plenty fast.
- **The rest** are small "do one thing" routes, such as add an event, check off a grocery, or save a haiku.

### `angie.js`: Miss Angie's brain
This is the heart of it. When your mom sends a message:

1. **Snapshot.** Angie builds a JSON picture of the household, like who's in the family, the next three weeks of events, what's in the fridge with days left, and the grocery list. That goes into her **system prompt** along with her personality and rules ("make small decisions yourself, keep replies short, only ask when it really needs her").
2. **Tools.** Claude is given a list of *tools*, which are actions it's allowed to take, like `add_event`, `set_dinner`, `add_groceries`, `create_decision`, `add_reminder` and `save_her_haiku`. Each has a little schema describing its inputs.
3. **The loop.** Claude replies. If it wants to use tools (`stop_reason === 'tool_use'`):
   - The server runs each one against the database.
   - It sends back the results (`tool_result`).
   - It asks Claude to continue.
   This repeats until Claude just talks (up to 8 rounds). That's how "we're having tacos tonight" turns into dinner being set *and* tortillas going on the list.
4. **Buttons.** The `offer_choices` tool lets Angie attach tappable answers (like "Yes, tomorrow" / "Keep it private") to her reply. `create_decision` puts something on the "Needs you" card with **Approve** and **Other idea** buttons. Approving tells Angie to go ahead, and she does the follow-up with her tools.

`scanPhoto()` sends a fridge or receipt photo to Claude. Claude reads the food it can see and estimates how many days each item has left, and the server saves the items to the fridge.

### `haiku.js`: the daily haiku
- **Two slots a day:** before 5pm and after. Each slot gets *one* haiku, picked once and remembered in `haiku_views`.
- **The order it picks in:**
  1. A haiku **she** wrote and said "show it tomorrow" to (it's `queued`). This always goes first.
  2. Sometimes one of her older ones, if "Bring back my old ones" is on.
  3. Otherwise Angie **writes a new one**. Claude gets the style rules (playful, a little existential, finding beauty with age) and up to 12 of *her* haiku as examples, so it learns her voice.
  4. With no API key, it reuses whichever saved haiku hasn't been shown for the longest.
- **About "trained on her writing":** Angie isn't retrained. Each time, she's shown your mom's own haiku as examples. The more your mom shares, the more it sounds like her.

### `scheduler.js`: what Angie does on her own
Every minute it checks:
- **The Sunday check-in:** is it Sunday after 7:30pm and hasn't she asked yet this week? Then it posts the check-in with the **Share a haiku** / **Not this week** buttons and sends a notification.
- **Reminders:** has one come due? Then it posts it in the chat and notifies her.

At 4:30am and 4:30pm it prepares the next haiku, so the loading screen doesn't have to wait for Claude.

### `push.js`: notifications
- Standard Web Push. The phone gives the server a "subscription", the server signs messages with your VAPID keys, and the phone shows them.
- Quiet hours mute everything except reminders.

---

## The app

There's no framework and no build step. Each screen is a function that **returns an HTML string**.

| File | What it does |
|---|---|
| `store.js` | **STATE.** One object `S` holds the data from `/api/state` plus what's on screen (which tab, which day, whether chat is open). `refresh()` reloads the data and redraws. |
| `app.js` | **INIT and DRAW.** Login, the first hello, the haiku loading screen, the router (`#/home`, `#/family`…), and `render()`, which draws the screen, the ink spray and the dock (Angie's card plus the tabs). |
| `views.js` | The screens (Home, Family, Fridge, Me, Edit profile, Notebook) and their slide-up sheets (add event, add person, meals…). |
| `chat.js` | Miss Angie herself: her card in the dock, the full conversation, voice mode, and her buttons. |
| `theme.js` | Time of day (which colors), **tonight's moon phase** (worked out from the date and drawn as an SVG), and the weather from Open-Meteo. |
| `ui.js` | Shared bits: icons, avatars, sheets, toasts, date formatting, photo shrinking. |
| `art.js` | The ink drawings from the mockups, saved as SVG text: the hen, the four sprays, weather icons and avatar choices. |
| `api.js` | `get`, `post`, `patch`, `put` and `del` wrappers around `fetch`. |

### How buttons work
- Any element with `data-action="something"` runs `ACTIONS.something` when tapped.
- There's one click listener for the whole app (in `app.js`), and each file registers its own actions with `register({...})`.
- To add a feature:
  1. Write a button with a new `data-action`.
  2. Register a function for it.
  3. Call the API, then `refresh()`.

### How the colors change
- `applyTheme()` sets `<html data-time="morning|afternoon|evening|night">`.
- The CSS swaps four variables based on that: `--paper`, `--ink`, `--acc` and `--card`. Everything else is built from those.
- At night `--card` turns moon cream, so cards stay light on the dusk blue.

### The loading screen
- The haiku shows once per slot. The browser remembers it was shown with a `localStorage` key like `ma-splash-2026-11-06-1`.
- It stays up for about 5 seconds so she can actually read it, and a tap skips ahead.

### Voice
- **Listening:** the browser's built-in speech recognition (`webkitSpeechRecognition`) shows her words live as she talks.
- **Answering:** when she talks, Angie answers out loud with `speechSynthesis`.
- **If the phone can't listen:** it falls back to typing, and the keyboard's own dictation mic still works.

---

## Things you might want to change

| To change… | Look here |
|---|---|
| How Angie talks | `systemPrompt()` in `server/angie.js` |
| Haiku style | `STYLE` in `server/haiku.js` |
| Time-of-day hours | `timeOfDay()` in `public/js/theme.js` |
| Colors | the top of `public/css/app.css` |
| The check-in wording | `sundayCheckin()` in `server/scheduler.js` |
| A new thing Angie can do | add a tool to `TOOLS` *and* a `case` in `runTool()` in `server/angie.js` |
