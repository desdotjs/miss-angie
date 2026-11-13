# Miss Angie

A family secretary in a phone web app, made for one mom. It has:

- a daily haiku on the loading screen
- a chat with Miss Angie that actually does things: the family calendar, the fridge, the grocery list, reminders and decisions
- colors and ink drawings that change with the time of day
- the weather, or tonight's real moon, in the corner
- a Sunday evening check-in asking if she's written any haiku

It's one small Node server, one SQLite file, and plain HTML, CSS and JavaScript. There's no build step.

For how it all fits together, see **WALKTHROUGH.md**.

---

## Run it on your computer

You need Node 22 (the database library requires it; `.node-version` pins it for Railway).

```bash
npm install
cp .env.example .env      # then open .env and fill it in
npm run dev               # restarts when you change a server file
```

Open http://localhost:3000 and log in with your `APP_PASSCODE`.

- **No `ANTHROPIC_API_KEY`?** The app still works. You can add family, events, fridge items and haiku by hand. Miss Angie just won't reply, write new haiku or read photos until there's a key.
- **Testing a time of day:** add `?time=night` (or `morning`, `afternoon`, `evening`) to the URL to see that palette.
- **Seeing the loading screen again:** add `?splash` to the URL.

## Put it online (Railway)

1. Push this folder to a **private** GitHub repo. The `.gitignore` already leaves out `.env` and the database.
2. In Railway, create a **New Project**, choose **Deploy from GitHub repo**, and pick the repo. Railway sees `package.json` and runs `npm start`.
3. **Add a volume** so her data survives redeploys. In the service, go to **Settings → Volumes**, add one, and mount it at `/data`.
4. Under **Variables**, add just these four:
   - `APP_PASSCODE`: the passcode your mom will type
   - `ANTHROPIC_API_KEY`: your Claude API key
   - `TZ`: her time zone, for example `America/Chicago`
   - `DATA_DIR`: set it to `/data`

   The cookie secret and notification keys are made automatically on first start and saved in the database.
5. Under **Settings → Networking**, click **Generate Domain**. That link is her app.

Any host that runs a Node server with a persistent disk works the same way, for example Render or Fly.io.

## Put it on her phone

- **iPhone:** open the link in Safari, tap **Share**, then tap **Add to Home Screen**. From then on, open Miss Angie from the home-screen icon.
- **Android:** open the link in Chrome, tap **⋮**, then tap **Add to Home screen**.

Then:
- Log in once with the passcode. It's remembered for a year.
- Let it use her location, so the weather corner shows the right weather.

## Phone notifications (reminders and the Sunday check-in)

On her phone, open the app **from the home-screen icon**, go to **Me**, and tap **Notifications → Turn on**. That's all: the keys are made automatically. (If you'd rather set your own, run `npm run vapid` and add `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` as Variables.)

Notifications are quiet during her quiet hours, except reminders, which always come through. On iPhone, web notifications need iOS 16.4 or newer and only work from the home-screen app.

## Costs

- **Railway:** a few dollars a month for a tiny always-on server.
- **Claude API:** pay as you go. For one person chatting a little each day, plus about two haiku a day, it's usually small. You can set a monthly spending limit in the Claude Console.
- **Weather** comes from [Open-Meteo](https://open-meteo.com), which is free for personal use with no key.

## What a web app can't do

These were in the design but browsers don't allow them, so they aren't here:

- **"Hey Angie" wake word:** a web app can't listen in the background. Tapping the mic is one tap away on every screen.
- **Lock-screen widget:** that needs a native iPhone or Android app. Adding it to the home screen is the closest thing.

If you ever want those, the next step would be wrapping this in a native app shell, for example with Capacitor.
