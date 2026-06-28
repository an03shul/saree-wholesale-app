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

**Auth:** `middleware/auth.js` — session token in `Authorization: Bearer` header (or `?token=` query param for SSE). Sessions expire after 30 days. PINs hashed with SHA-256. Rate-limited to 5 attempts/15 min per IP.

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

- Backend: Railway with Docker (`backend/Dockerfile`). Database backed up continuously to Cloudflare R2 via Litestream (`litestream.yml`). Images also stored in R2.
- Mobile web: `expo export -p web` → Cloudflare Pages (`gopiram-app.pages.dev`).
- Default admin: username `admin`, PIN `1234` (auto-created on first run if no users exist).

## Graphify Knowledge Graph

This project uses graphify. See `.agents/rules/graphify.md` for full rules (trigger: always_on). Key points:
- For codebase/architecture questions, query via `graphify query "<question>"` rather than grepping raw files
- After modifying any code files, run `graphify update .` to keep the graph current

## Expo Version Note

The mobile app uses Expo SDK 56 (React Native 0.85.3, React 19). Always check [https://docs.expo.dev/versions/v56.0.0/](https://docs.expo.dev/versions/v56.0.0/) before using Expo APIs — the API surface changes significantly between SDK versions.
