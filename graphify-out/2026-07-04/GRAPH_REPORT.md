# Graph Report - gopiram-saree  (2026-07-04)

## Corpus Check
- 91 files · ~88,808 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 649 nodes · 925 edges · 57 communities (51 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `81a1c782`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Project Documentation (CLAUDE.md)|Project Documentation (CLAUDE.md)]]
- [[_COMMUNITY_Mobile Package Dependencies|Mobile Package Dependencies]]
- [[_COMMUNITY_Tally & WhatsApp Send Integration|Tally & WhatsApp Send Integration]]
- [[_COMMUNITY_Mobile App Shell & Navigation|Mobile App Shell & Navigation]]
- [[_COMMUNITY_Storage & Bulk Import Pipeline|Storage & Bulk Import Pipeline]]
- [[_COMMUNITY_Backend Package Dependencies|Backend Package Dependencies]]
- [[_COMMUNITY_Expo App Config & Icons|Expo App Config & Icons]]
- [[_COMMUNITY_Catalog Screens & Theme|Catalog Screens & Theme]]
- [[_COMMUNITY_App Entry & Thumbnail Service|App Entry & Thumbnail Service]]
- [[_COMMUNITY_PDF Export & Watermarking|PDF Export & Watermarking]]
- [[_COMMUNITY_Mobile API Client & Screens|Mobile API Client & Screens]]
- [[_COMMUNITY_Database & Catalog Metadata|Database & Catalog Metadata]]
- [[_COMMUNITY_Designs & Send Screens|Designs & Send Screens]]
- [[_COMMUNITY_Authentication & Rate Limiting|Authentication & Rate Limiting]]
- [[_COMMUNITY_AI Saree Identification|AI Saree Identification]]
- [[_COMMUNITY_Admin & Orders Screen Utils|Admin & Orders Screen Utils]]
- [[_COMMUNITY_Railway Deployment Config|Railway Deployment Config]]
- [[_COMMUNITY_Items & Settings Routes|Items & Settings Routes]]
- [[_COMMUNITY_Orders & Push Notifications|Orders & Push Notifications]]
- [[_COMMUNITY_Tally Sync Agent Package|Tally Sync Agent Package]]
- [[_COMMUNITY_Cloudflare Pages Worker Package|Cloudflare Pages Worker Package]]
- [[_COMMUNITY_PWA Web Manifest|PWA Web Manifest]]
- [[_COMMUNITY_Designs Route (Upload)|Designs Route (Upload)]]
- [[_COMMUNITY_Tally Sync Agent Docs|Tally Sync Agent Docs]]
- [[_COMMUNITY_Contact Import Script|Contact Import Script]]
- [[_COMMUNITY_Tally Sync Agent Logic|Tally Sync Agent Logic]]
- [[_COMMUNITY_Design Share Utilities|Design Share Utilities]]
- [[_COMMUNITY_Cloudflare Workers Docs|Cloudflare Workers Docs]]
- [[_COMMUNITY_Contacts Route & Audit Log|Contacts Route & Audit Log]]
- [[_COMMUNITY_Admin Panel Routes|Admin Panel Routes]]
- [[_COMMUNITY_Brands Route|Brands Route]]
- [[_COMMUNITY_PWA Injection Script|PWA Injection Script]]
- [[_COMMUNITY_QR Scan Screen|QR Scan Screen]]
- [[_COMMUNITY_Image CropRotate Editor|Image Crop/Rotate Editor]]
- [[_COMMUNITY_Public Catalog Page|Public Catalog Page]]
- [[_COMMUNITY_Image Viewer Modal|Image Viewer Modal]]
- [[_COMMUNITY_Cloudflare Worker Entry|Cloudflare Worker Entry]]
- [[_COMMUNITY_Push Subscription Route|Push Subscription Route]]
- [[_COMMUNITY_Stats Route|Stats Route]]
- [[_COMMUNITY_Tally Sync Push Route|Tally Sync Push Route]]
- [[_COMMUNITY_Docker Entrypoint|Docker Entrypoint]]
- [[_COMMUNITY_Fabric Type Constants|Fabric Type Constants]]
- [[_COMMUNITY_Mobile Expo Notes|Mobile Expo Notes]]
- [[_COMMUNITY_Graphify Rules|Graphify Rules]]
- [[_COMMUNITY_Graphify Workflow|Graphify Workflow]]
- [[_COMMUNITY_Worker Config|Worker Config]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]

## God Nodes (most connected - your core abstractions)
1. `colors` - 14 edges
2. `shadow` - 14 edges
3. `notify()` - 14 edges
4. `useUser()` - 13 edges
5. `expo` - 10 edges
6. `requireAdmin()` - 9 edges
7. `setAuthToken()` - 9 edges
8. `getImageUrl()` - 9 edges
9. `getThumbUrl()` - 9 edges
10. `confirmAction()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `viaHttp()` --calls--> `fetch()`  [INFERRED]
  backend/scripts/import-contacts.js → mobile/broken-violet-21ab/src/index.js
- `buildShareFile()` --calls--> `fetch()`  [INFERRED]
  mobile/src/utils/share.js → mobile/broken-violet-21ab/src/index.js
- `DesignsScreen()` --calls--> `useUser()`  [EXTRACTED]
  mobile/src/screens/DesignsScreen.js → mobile/App.js
- `MoreScreen()` --calls--> `useUser()`  [EXTRACTED]
  mobile/src/screens/MoreScreen.js → mobile/App.js
- `TasksScreen()` --calls--> `useUser()`  [EXTRACTED]
  mobile/src/screens/TasksScreen.js → mobile/App.js

## Import Cycles
- None detected.

## Communities (57 total, 6 thin omitted)

### Community 0 - "Project Documentation (CLAUDE.md)"
Cohesion: 0.21
Nodes (12): Alert.alert No-Op on Web, src/api/client.js (Axios API Client), Backend, Commands, Expo SDK 56, Gopiram Saree System, Graphify Knowledge Graph, AI Identify (routes/identify.js + services/identify.js) (+4 more)

### Community 1 - "Mobile Package Dependencies"
Cohesion: 0.06
Nodes (31): dependencies, axios, expo, expo-camera, expo-contacts, expo-image-manipulator, expo-image-picker, expo-status-bar (+23 more)

### Community 2 - "Tally & WhatsApp Send Integration"
Cohesion: 0.09
Nodes (26): db, express, { getStockForDesigns }, router, { sendDesignUpdates }, db, express, { getCustomers, getStockBalance, detectMode } (+18 more)

### Community 3 - "Mobile App Shell & Navigation"
Cohesion: 0.11
Nodes (22): api, contactsApi, fabricsApi, getCustomCatalogUrl(), getPdfUrl(), getThumbUrl(), itemsApi_stock, sendApi (+14 more)

### Community 4 - "Storage & Bulk Import Pipeline"
Cohesion: 0.05
Nodes (32): path, TEMP_UPLOADS_DIR, express, { identifyDesign }, multer, router, upload, db (+24 more)

### Community 5 - "Backend Package Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, @anthropic-ai/sdk, @aws-sdk/client-s3, axios, cors, dotenv, express, jimp (+17 more)

### Community 6 - "Expo App Config & Icons"
Cohesion: 0.08
Nodes (23): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, expo, android, icon (+15 more)

### Community 7 - "Catalog Screens & Theme"
Cohesion: 0.09
Nodes (21): dependencies, axios, lucide-react, react, react-dom, react-router-dom, devDependencies, oxlint (+13 more)

### Community 8 - "App Entry & Thumbnail Service"
Cohesion: 0.14
Nodes (20): brandsApi, getCatalogUrl(), ordersApi, colors, modalBase, shadow, useUser(), BrandsScreen() (+12 more)

### Community 9 - "PDF Export & Watermarking"
Cohesion: 0.25
Nodes (6): Environment Variables, Expo Version Note, Project Overview, Role permissions (admin / staff / staff2), Search, contacts import & audit logging, Tasks (assignment)

### Community 10 - "Mobile API Client & Screens"
Cohesion: 0.06
Nodes (32): app, db, express, fs, { getWatermarkedBuffer }, path, PDFDocument, router (+24 more)

### Community 11 - "Database & Catalog Metadata"
Cohesion: 0.12
Nodes (13): crypto, { DatabaseSync }, db, fabricCount, itemsInfo, path, tmplExists, userCount (+5 more)

### Community 12 - "Designs & Send Screens"
Cohesion: 0.08
Nodes (27): adminApi, authApi, loadStoredToken(), setAuthToken(), settingsApi, App(), doLogout(), HeaderLogoutButton() (+19 more)

### Community 13 - "Authentication & Rate Limiting"
Cohesion: 0.18
Nodes (10): checkRateLimit(), clearAttempts(), db, loginAttempts, recordFailedAttempt(), crypto, db, express (+2 more)

### Community 14 - "AI Saree Identification"
Cohesion: 0.20
Nodes (8): db, express, multer, path, { requireAdmin }, router, storage, upload

### Community 15 - "Admin & Orders Screen Utils"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 16 - "Railway Deployment Config"
Cohesion: 0.18
Nodes (10): build, builder, dockerfilePath, deploy, healthcheckPath, healthcheckTimeout, restartPolicyMaxRetries, restartPolicyType (+2 more)

### Community 17 - "Items & Settings Routes"
Cohesion: 0.18
Nodes (9): requireAdmin(), db, express, { requireAdmin }, router, db, express, { requireAdmin } (+1 more)

### Community 18 - "Orders & Push Notifications"
Cohesion: 0.21
Nodes (10): db, express, { notifyAll }, { requireAuth, requireAdmin }, router, db, notifyAll(), notifyUser() (+2 more)

### Community 19 - "Tally Sync Agent Package"
Cohesion: 0.18
Nodes (10): dependencies, axios, dotenv, xml2js, description, main, name, scripts (+2 more)

### Community 20 - "Cloudflare Pages Worker Package"
Cohesion: 0.20
Nodes (9): devDependencies, wrangler, name, private, scripts, deploy, dev, start (+1 more)

### Community 21 - "PWA Web Manifest"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 22 - "Designs Route (Upload)"
Cohesion: 0.29
Nodes (8): app.js (Backend Entry Point), Deployment, ⚠️ Deployment gotchas (learned the hard way), Litestream (DB Backup + R2 Credentials), Cloudflare Pages Auto-Build Clobbers Production, No functions/ Directory in Pages Project, Cloudflare R2 (Object Storage), services/storage.js (Storage Abstraction)

### Community 23 - "Tally Sync Agent Docs"
Cohesion: 0.20
Nodes (9): 1. Install Node.js, 2. Copy this folder, 3. Create the settings file, 4. Turn on Tally's connector (one time, in Tally), 5. Start the agent, Gopiram Tally Sync Agent, Keeping it running automatically (optional but recommended), One-time setup (on the shop PC) (+1 more)

### Community 24 - "Contact Import Script"
Cohesion: 0.11
Nodes (12): contacts, fs, path, seedPath, tokenArg, useHttp, viaHttp(), fetch() (+4 more)

### Community 25 - "Tally Sync Agent Logic"
Cohesion: 0.28
Nodes (6): axios, CLOUD_URL, readTallyCustomers(), readTallyStock(), syncOnce(), xml2js

### Community 26 - "Design Share Utilities"
Cohesion: 0.20
Nodes (10): Architecture, Backend (`backend/src/`), Bulk Contact Import (import-contacts.js), Contact List Search (client-side filter), Data model, Design Search (GET /api/designs/search), Mobile (`mobile/src/`), routes/tally.js (Tally XML LAN query) (+2 more)

### Community 27 - "Cloudflare Workers Docs"
Cohesion: 0.25
Nodes (7): Best Practices (conditional), Cloudflare Workers, Commands, Docs, Errors, Node.js Compatibility, Product Docs

### Community 28 - "Contacts Route & Audit Log"
Cohesion: 0.29
Nodes (5): logActivity(), db, express, { requireAdmin, logActivity }, router

### Community 29 - "Admin Panel Routes"
Cohesion: 0.25
Nodes (6): requireAuth(), crypto, db, express, { requireAuth, requireAdmin }, router

### Community 30 - "Brands Route"
Cohesion: 0.29
Nodes (5): crypto, db, express, { requireAdmin }, router

### Community 31 - "PWA Injection Script"
Cohesion: 0.29
Nodes (6): fs, html, indexPath, path, swDst, swSrc

### Community 32 - "QR Scan Screen"
Cohesion: 0.33
Nodes (5): Deploy (Cloudflare Pages, same stack as the app), Details to fill in (search the code for `TODO` and `98765 43210`), Gopiram Sarees — public landing page, Preview locally, Single-file version for AI Studio (redesigning the frontend)

### Community 33 - "Image Crop/Rotate Editor"
Cohesion: 0.38
Nodes (7): routes/catalog.js (Public Catalog Page), Image Pipeline, Escape Client-Side Template Literals, services/thumbnail.js, services/watermark.js, Watermark Serial Queue, services/whatsapp.js (Meta Business API)

### Community 34 - "Public Catalog Page"
Cohesion: 0.16
Nodes (7): db, express, path, router, db, express, router

### Community 35 - "Image Viewer Modal"
Cohesion: 0.13
Nodes (10): importApi, itemsApi, ImageEditorModal(), styles, ImageViewerModal(), styles, BulkImportScreen(), styles (+2 more)

### Community 36 - "Cloudflare Worker Entry"
Cohesion: 0.33
Nodes (6): Audit Logging (logActivity middleware), middleware/auth.js (Auth), Role Permissions (staff vs admin), Known Gap: Unprotected POST Routes, routes/auth.js (Login), Staff Single-Session Policy

### Community 37 - "Push Subscription Route"
Cohesion: 0.26
Nodes (10): getWmUrl(), identifyApi, IdentifyScreen(), styles, buildShareCard(), buildShareFile(), downloadFiles(), notify() (+2 more)

### Community 38 - "Stats Route"
Cohesion: 0.50
Nodes (3): db, express, router

### Community 39 - "Tally Sync Push Route"
Cohesion: 0.50
Nodes (3): db, express, router

### Community 47 - "Worker Config"
Cohesion: 0.50
Nodes (4): db/database.js (SQLite DatabaseSync), No Migration Framework (ALTER TABLE try/catch), parseServerDate (mobile/src/utils/date.js), SQLite CURRENT_TIMESTAMP UTC Parsing

### Community 49 - "Community 49"
Cohesion: 0.50
Nodes (3): Expanding the Oxlint configuration, React Compiler, React + Vite

### Community 55 - "Community 55"
Cohesion: 0.33
Nodes (5): designsApi, getImageUrl(), DesignsScreen(), ScanScreen(), styles

### Community 56 - "Community 56"
Cohesion: 0.29
Nodes (5): db, express, { notifyUser }, { requireAuth, requireAdmin }, router

## Knowledge Gaps
- **352 isolated node(s):** `docker-entrypoint.sh script`, `name`, `version`, `main`, `start` (+347 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetch()` connect `Contact Import Script` to `Push Subscription Route`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `subscribeToPush()` connect `Contact Import Script` to `Designs & Send Screens`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `docker-entrypoint.sh script`, `name`, `version` to the rest of the system?**
  _360 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Mobile Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `Tally & WhatsApp Send Integration` be split into smaller, more focused modules?**
  _Cohesion score 0.09462365591397849 - nodes in this community are weakly interconnected._
- **Should `Mobile App Shell & Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.10846560846560846 - nodes in this community are weakly interconnected._
- **Should `Storage & Bulk Import Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.0545876887340302 - nodes in this community are weakly interconnected._