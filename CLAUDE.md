# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gopiram Saree is a saree business management system with two sub-projects:
- `backend/` — Node.js/Express REST API with SQLite
- `mobile/` — React Native/Expo app (v56)

## Commands

### Backend
```bash
cd backend
npm run dev      # nodemon (hot reload)
npm start        # production (node src/app.js)
```
Requires Node ≥ 22. No test runner is configured.

### Mobile
```bash
cd mobile
npx expo start           # interactive launcher
npx expo start --ios     # iOS simulator
npx expo start --android # Android emulator
npx expo export -p web && node scripts/inject-pwa.js  # build web PWA
```

### Local HTTPS (required for mobile on LAN)
The backend uses self-signed certs (`192.168.29.187+2.pem`) so the iPhone can connect over LAN. In production, set `SERVE_HTTP=true` (TLS terminated by Railway).

## Architecture

### Backend (`backend/src/`)

**Entry point:** `app.js` — sets up CORS (allowlist: `gopiramsarees.in`, `gopiram-app.pages.dev`), mounts routes, serves images from storage.

**Database:** `db/database.js` — single `DatabaseSync` (Node built-in SQLite, not `better-sqlite3`). Schema is defined inline with `CREATE TABLE IF NOT EXISTS`; migrations are done with individual `ALTER TABLE` wrapped in try/catch blocks. **No migration framework** — add new columns the same way.

**Auth:** `middleware/auth.js` — session token in `Authorization: Bearer` header (or `?token=` query param for SSE). Sessions expire after 30 days. PINs hashed with SHA-256. Rate-limited to 5 attempts/15 min per IP. **Staff accounts are single-session**: `routes/auth.js` login deletes all existing `sessions` rows for a `role='staff'` user before creating the new one, so logging in on a new device silently signs out any other device. Admin accounts keep unlimited concurrent sessions.

**Storage abstraction:** `services/storage.js` — switches between Cloudflare R2 (production) and local disk (`UPLOADS_DIR`) based on env vars. R2 reuses Litestream credentials (`LITESTREAM_*`). Images are stored under the `images/` prefix in R2.

**Image pipeline:**
1. Upload lands via `multer` in the route
2. `services/watermark.js` — adds "Powered by Nayvert AI" text, caps width at 1080px, queues via promise chain to avoid concurrent Jimp contention
3. `services/thumbnail.js` — 560px JPEG thumbnails served at `/thumb/:name`
4. Watermarked versions served at `/uploads/wm/:name`, originals at `/uploads/:name`

**WhatsApp sending:** `services/whatsapp.js` — uses Meta WhatsApp Business API (Graph API v19.0). Sends watermarked image + caption built from a per-shop template stored in the `settings` table.

**Tally integration:** Two-phase — `routes/tally.js` queries Tally XML directly (only works when backend is on the same LAN as the shop PC), `routes/tallySync.js` accepts pushes from a Windows sync agent running at the shop. Stock is cached in the `tally_stock` table, keyed by `tally_item_name`.

**AI identify:** `routes/identify.js` + `services/identify.js` — uses Anthropic SDK + Tesseract OCR to identify saree details from a photo.

### Data model

```
brands → items → designs   (CASCADE deletes)
contacts                   (customers/WhatsApp groups)
orders                     (linked to designs)
users / sessions           (auth)
settings                   (key/value, e.g. whatsapp_template)
tally_stock / tally_customers  (sync cache)
fabric_types / work_categories (catalog metadata)
activity_log               (audit trail)
```

### Mobile (`mobile/src/`)

**Navigation:** Bottom tabs — Catalog (Brands → Items → Designs stack), Orders, Send, More (Contacts, Scan, Identify, BulkImport, Admin).

**Auth flow:** `App.js` calls `loadStoredToken()` then `authApi.me()` on mount. Token stored in `AsyncStorage`, set as default `Authorization` header on the axios instance.

**API client:** `src/api/client.js` — single axios instance. All API modules (`brandsApi`, `itemsApi`, `designsApi`, etc.) are exported from this file. `API_BASE_URL` comes from `EXPO_PUBLIC_API_URL` env var, falls back to `https://192.168.29.187:3000`.

**Image URLs:**
- `getImageUrl(photoPath)` → `/uploads/<path>` (original)
- `getThumbUrl(photoPath)` → `/thumb/<path>` (560px thumbnail)
- `getCatalogUrl(brandId)` → `/catalog/<brandId>` (public shareable link)

## Environment Variables

**Backend** (copy `backend/.env.example` → `backend/.env`):
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` — Meta Business API
- `LITESTREAM_*` — R2 credentials (also used for image storage)
- `SYNC_AGENT_TOKEN` — shared secret for the Tally Windows sync agent
- `SERVE_HTTP=true` — set on Railway (platform handles TLS)
- `DB_PATH` — defaults to `backend/gopiram.db`

**Mobile** (copy `mobile/.env.example` → `mobile/.env`):
- `EXPO_PUBLIC_API_URL` — backend base URL

## Deployment

- Backend: Railway with Docker (`backend/Dockerfile`, config in `backend/railway.json`). Auto-deploys on push to `main` via Railway's GitHub integration. The Docker build (litestream download + `apt install` + `npm ci`) plus the Litestream DB restore on boot takes **several minutes** — `git push` does not mean the API is live yet. Health check: `GET /api/health`. Database backed up continuously to Cloudflare R2 via Litestream (`litestream.yml`). Images also stored in R2.
- Mobile web: `npx expo export -p web && node scripts/inject-pwa.js` → deploy with `npx wrangler pages deploy dist --project-name gopiram-app`. Live at `gopiram-app.pages.dev` and custom domain `app.gopiramsarees.in`.
- Default admin: username `admin`, PIN `1234` (auto-created on first run if no users exist).

### ⚠️ Deployment gotchas (learned the hard way)

1. **The Cloudflare Pages Git auto-build is BROKEN — it clobbers production on every push.** The project has a GitHub integration that auto-builds on every push to `main`, but that auto-build produces an **empty deployment that 404s everything** (wrong build command/output dir in the dashboard). Because the production alias always points at the *newest* deployment, every `git push` takes the live PWA down. **After any `git push`, you MUST run `wrangler pages deploy dist` again to reclaim production** (your manual deploy becomes the newest). Wait for the auto-build to land first (poll `wrangler pages deployment list`), otherwise it lands *after* your manual deploy and clobbers it again. **Permanent fix (do this once in the dashboard): disable automatic Git deployments**, or correct the build settings (root dir `mobile`, build command `npx expo export -p web && node scripts/inject-pwa.js`, output dir `dist`).
2. **Never add a `functions/` directory to the mobile Pages project.** Adding any Pages Function flips the whole project from static-first to Worker-first routing; without a catch-all the SPA root 404s and the entire app goes down.
3. **The catalog page must NOT do blocking per-image work at render time.** Watermarks are lazy-generated by the `/uploads/wm/*` route on first request (cached in R2). `services/watermark.js` funnels all `getWatermarkedPath` calls through a single global serial queue — calling it in a loop per design makes the page time out. Keep image generation out of the HTML response path.
4. **Escape client-side `${...}` inside server-built HTML template strings.** `routes/catalog.js` builds the page (and an inline `<script>`) as a JS template literal. Any `${expr}` that should run *in the browser* must be written `\${expr}` — otherwise Node evaluates it at render time. An unescaped `${phone}` once threw `phone is not defined`, which rejected the async route so it never responded and the catalog link hung/timed out. The route is now wrapped in try/catch to fail loudly (500) instead of hanging.
5. **`Alert.alert` is a no-op on web (react-native-web).** In the mobile app's web/PWA build, `Alert.alert` shows nothing, so `catch { Alert.alert('Error', …) }` silently swallows failures — this is why the Send/share button "did nothing" on the staff's Android phone. Use a web-aware notifier (`window.alert` on web) for anything the user must see. Also: `navigator.share()` needs transient user activation, which an intervening `await fetch()` can drop on Android Chrome — always provide a fallback (e.g. download the image) when it fails.
6. **SQLite's `CURRENT_TIMESTAMP` is UTC with no timezone marker, and `new Date(ts)` silently mis-parses it.** Timestamps come back as `"YYYY-MM-DD HH:MM:SS"` (space-separated, no `Z`). Passing that straight to `new Date(ts)` on the client gets parsed as *local* time instead of UTC, so every displayed timestamp is off by the viewer's UTC offset (e.g. admin activity-log times looked wrong by exactly +5:30 for IST users). Always normalize with `mobile/src/utils/date.js`'s `parseServerDate()` (replaces the space with `T` and appends `Z`) before constructing a `Date` from any `created_at`-style column — don't call `new Date(ts)` directly on raw server timestamps.

## Search, contacts import & audit logging

**Design search (home screen).** `GET /api/designs/search?q=` (`designsApi.search`) searches design_number / item name / brand name across all brands and returns `d.*` plus `item_name`, `brand_name`, `brand_id` (LIMIT 50). Used by both `OrdersScreen` (attach a design to an order) and `BrandsScreen` (the home-screen search bar that shows each match's **stock status + price**, tappable to the brand's items). Available to admin **and** staff — no admin gate on the route or the UI.

**Contact list search.** `ContactsScreen` and the Send screen's recipient picker (`ContactPicker` in `SendScreen.js`) both filter client-side over the full contacts array (name substring or digits-only phone match) — never render all ~1000 rows at once. The Send picker collapses to a compact "picked" bar with a Change button once a recipient is chosen.

**Bulk contact import.** `backend/scripts/import-contacts.js` loads `backend/scripts/contacts-seed.json` either directly into the DB (respects `DB_PATH`) or over HTTP via `POST /api/contacts/import` (admin-only, idempotent — `INSERT OR IGNORE` on the unique phone). Phones are normalized to `91XXXXXXXXXX`. HTTP mode: `API_URL=https://api.gopiramsarees.in node scripts/import-contacts.js --http --token=<ADMIN_TOKEN>` (mint the token via `POST /api/auth/login`; admin allows concurrent sessions so this won't sign you out).

**Audit logging.** The `logActivity(action, getDetails)` middleware (in `middleware/auth.js`) writes to `activity_log`, viewable in **Admin Panel → Logs** (admin-only). It is wired onto the contacts routes: **Added / Edited / Deleted contact** and **Imported contacts**, each with the contact `name · phone` in `details`. The DELETE route looks up the contact and returns it in the response body (`{ success, deleted }`) so the middleware — which reads `res.json`'s body *after* the row is gone — can still name what was removed. Add more audit entries the same way: attach `logActivity(...)` as route middleware and return anything it needs in the response body.

### Role permissions (staff vs admin)
- **Staff can:** add items, add designs, add/edit/**delete** contacts (contacts have no admin gate on either the API or the UI).
- **Admin only:** create/edit/delete brands, edit/delete items, edit/delete/stock-toggle designs, delete orders, bulk contact import, everything under `/api/admin/*`, and viewing the activity log. These are enforced with `requireAdmin` on the backend **and** `isAdmin` gates in the UI.
- **Known gap:** the backend `POST` routes for brands/items/designs are *not* `requireAdmin` — only the mobile UI hides those add buttons (brand-add is UI-gated; item/design add is intentionally open to staff). A staff user could still create brands via the raw API. Add `requireAdmin` to those POSTs if you want defense in depth.

## Graphify Knowledge Graph

This project uses graphify. See `.agents/rules/graphify.md` for full rules (trigger: always_on). Key points:
- For codebase/architecture questions, query via `graphify query "<question>"` rather than grepping raw files
- After modifying any code files, run `graphify update .` to keep the graph current

## Expo Version Note

The mobile app uses Expo SDK 56 (React Native 0.85.3, React 19). Always check [https://docs.expo.dev/versions/v56.0.0/](https://docs.expo.dev/versions/v56.0.0/) before using Expo APIs — the API surface changes significantly between SDK versions.
