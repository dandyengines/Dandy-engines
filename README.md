# Dandy Engines

Workshop job flow & priority system. Data lives in Netlify Blobs, accessed via
Netlify Functions — no separate database. Same architecture pattern as the
911 Restoration Log app this was based on.

## Status: Stage 6 of 6 — Alerts, photos, Machining, brand finishing (COMPLETE)

Stages 1–5 unchanged and still live. New in Stage 6:
- **Push notifications**: real Web Push (VAPID), same approach as the
  reference app. "🔔 Enable Alerts" in Settings requests permission and
  subscribes; simple on/off toggles per category (own-sheet changes,
  Urgent flags, new job via Part Payments, Rottler entries, Part Payments
  entries) — no fine-grained who-triggers controls, as specced. **iOS
  requires the app to be added to Home Screen first**, same restriction
  noted back in Stage 1.
- **Photos**: attach photos to any job on My Jobs / Machining (upload via
  the file picker in a job's expanded detail); thumbnails load through an
  authenticated fetch, not a plain `<img src>`, matching the reference
  app's approach — plain `<img>` tags can't send the auth header the API
  needs. Shown read-only on All Jobs too.
- **Machining** tab: Jake's own private sheet, built on the same job-card
  system as My Jobs (stages, colours, drag reorder, notes, photos) —
  invisible to everyone else.
- **Service worker registration was fixed** — it existed since Stage 1 but
  was never actually registered by `app.js` until now, which push
  notifications depend on.
- Brand kit (logo, palette, Straczynski font) has been consistent since
  Stage 1 — nothing further needed here.

## What's fully built
Auth & roles · My Jobs · All Jobs · Tunnel Vision · Rottler · Part Payments
· History/revert · Machining · Alerts/push · Photos · Dark/light theme ·
responsive phone/tablet/desktop layout.

## Known limitations worth knowing about
- Reverting a Part Payments entry that auto-created a new job on someone's
  sheet won't also un-create that job (flagged in Stage 5) — two separate
  records under the hood.
- The default VAPID keys are checked into source for convenience — replace
  them via environment variables before this ever goes properly public.
- Push delivery is best-effort: a failed or expired subscription is
  silently skipped rather than erroring, so a stale subscription on
  someone's old phone just means they quietly stop getting alerts until
  they re-enable them, rather than breaking anything else.


## Passwords

Defaults are hardcoded as a fallback in `netlify/functions/roles.js`. **Before
going live (or if this repo is ever made public), set these as private
environment variables** in Netlify: Site settings → Environment variables.

| Person | Env var |
|---|---|
| Jake | `JAKE_PASSWORD` |
| Mike | `MIKE_PASSWORD` |
| Frank | `FRANK_PASSWORD` |
| Sab | `SAB_PASSWORD` |
| Lou | `LOU_PASSWORD` |
| Dean | `DEAN_PASSWORD` |
| Ulrich | `ULRICH_PASSWORD` |
| Gus | `GUS_PASSWORD` |
| Mel | `MEL_PASSWORD` |
| Nathaniel | `NATHANIEL_PASSWORD` |

**Push notifications** also use a VAPID key pair. A real, working default
pair is baked into `netlify/functions/_push.js` so alerts work out of the
box — but since it ships in the source, generate your own before going
public and set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` as environment
variables (Netlify CLI: `npx web-push generate-vapid-keys`).

## Deploy to Netlify (~2 minutes)

**Option A — Netlify CLI (recommended)**
Drag-and-drop deploys don't always run `npm install` for serverless
functions, which can leave `@netlify/blobs` missing and the login endpoint
broken. The CLI avoids this:
```
npm install -g netlify-cli
cd dandy-engines
netlify deploy --prod
```
Follow the prompts (log in, link to your existing site or create a new one).

**Option B — drag and drop (fastest, but see note above)**
1. Go to https://app.netlify.com/drop
2. Drag the whole `dandy-engines` folder onto the page.
3. Netlify builds it and gives you a URL like `random-name-123.netlify.app`.
4. Optional: Site settings → Domain management, change the subdomain to
   something memorable.
5. **Check it worked:** in the site dashboard, open the *Functions* tab —
   you should see `auth` listed. If it's missing, or login gives a
   "Server error" message, redeploy with Option A instead.

**Option C — connect to git (best long-term)**
1. Push this folder to a new GitHub repo.
2. In Netlify: Add new site → Import an existing project → pick the repo.
3. Build settings are already set via `netlify.toml` — just click Deploy.

## Install on your phone

**iPhone (Safari):** open the URL → Share icon → "Add to Home Screen."
**Android (Chrome):** open the URL → ⋮ menu → "Add to Home screen."

Push notifications (added in a later stage) only work once installed this
way — a plain Safari/Chrome tab can't receive them.

## Editing later
- `public/index.html` / `styles.css` / `app.js` — the app itself
- `netlify/functions/roles.js` — the single source of truth for who can see
  and edit what; every function reads from here
- `netlify/functions/auth.js` — login endpoint
- `public/fonts/StraczynskiBold-Vy00.ttf` — the brand heading/menu font
- `public/sw.js` — bump the `CACHE` constant on every release, or installed
  phones will keep serving the old cached shell after a redeploy
