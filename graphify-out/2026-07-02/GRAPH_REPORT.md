# Graph Report - gopiram-saree  (2026-07-02)

## Corpus Check
- 78 files · ~65,576 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 525 nodes · 745 edges · 37 communities (31 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5afd91ed`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Mobile API Client Modules|Mobile API Client Modules]]
- [[_COMMUNITY_Authentication & Security Middleware|Authentication & Security Middleware]]
- [[_COMMUNITY_Catalog Generation & HTML Services|Catalog Generation & HTML Services]]
- [[_COMMUNITY_Design Management & Uploads|Design Management & Uploads]]
- [[_COMMUNITY_Mobile Dependencies & Expo Modules|Mobile Dependencies & Expo Modules]]
- [[_COMMUNITY_Database Core & Schema Management|Database Core & Schema Management]]
- [[_COMMUNITY_Backend Dependencies & Services|Backend Dependencies & Services]]
- [[_COMMUNITY_Mobile Assets & Icons Configuration|Mobile Assets & Icons Configuration]]
- [[_COMMUNITY_File Storage & Paths Configuration|File Storage & Paths Configuration]]
- [[_COMMUNITY_Tally ERP Sync Integration|Tally ERP Sync Integration]]
- [[_COMMUNITY_Bulk Import Service|Bulk Import Service]]
- [[_COMMUNITY_AI Identification Service|AI Identification Service]]
- [[_COMMUNITY_PDF Export & Report Generator|PDF Export & Report Generator]]
- [[_COMMUNITY_WhatsApp Messaging Integration|WhatsApp Messaging Integration]]
- [[_COMMUNITY_Thumbnail Generation Service|Thumbnail Generation Service]]
- [[_COMMUNITY_Watermark Processing Engine|Watermark Processing Engine]]
- [[_COMMUNITY_Tally Desktop Agent Core|Tally Desktop Agent Core]]
- [[_COMMUNITY_Theme & Styling Constants|Theme & Styling Constants]]
- [[_COMMUNITY_Admin Screen UI Components|Admin Screen UI Components]]
- [[_COMMUNITY_Order Processing & Cart UI|Order Processing & Cart UI]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 35|Community 35]]

## God Nodes (most connected - your core abstractions)
1. `notify()` - 12 edges
2. `useUser()` - 11 edges
3. `expo` - 10 edges
4. `colors` - 10 edges
5. `shadow` - 10 edges
6. `requireAdmin()` - 9 edges
7. `getImageUrl()` - 9 edges
8. `web` - 8 edges
9. `setAuthToken()` - 8 edges
10. `getThumbUrl()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `viaHttp()` --calls--> `fetch()`  [INFERRED]
  backend/scripts/import-contacts.js → mobile/broken-violet-21ab/src/index.js
- `subscribeToPush()` --calls--> `fetch()`  [INFERRED]
  mobile/src/utils/pushSubscription.js → mobile/broken-violet-21ab/src/index.js
- `buildShareFile()` --calls--> `fetch()`  [INFERRED]
  mobile/src/utils/share.js → mobile/broken-violet-21ab/src/index.js
- `sendDesignUpdates()` --calls--> `getWatermarkedPath()`  [EXTRACTED]
  backend/src/services/whatsapp.js → backend/src/services/watermark.js
- `BrandsScreen()` --calls--> `useUser()`  [EXTRACTED]
  mobile/src/screens/BrandsScreen.js → mobile/App.js

## Import Cycles
- None detected.

## Communities (37 total, 6 thin omitted)

### Community 0 - "Mobile API Client Modules"
Cohesion: 0.05
Nodes (76): adminApi, api, authApi, brandsApi, contactsApi, designsApi, fabricsApi, getCatalogUrl() (+68 more)

### Community 1 - "Authentication & Security Middleware"
Cohesion: 0.18
Nodes (10): checkRateLimit(), clearAttempts(), db, loginAttempts, recordFailedAttempt(), crypto, db, express (+2 more)

### Community 2 - "Catalog Generation & HTML Services"
Cohesion: 0.07
Nodes (28): db, express, path, router, db, express, fs, { getWatermarkedBuffer } (+20 more)

### Community 3 - "Design Management & Uploads"
Cohesion: 0.06
Nodes (30): path, TEMP_UPLOADS_DIR, db, express, multer, path, { requireAdmin }, router (+22 more)

### Community 4 - "Mobile Dependencies & Expo Modules"
Cohesion: 0.06
Nodes (31): dependencies, axios, expo, expo-camera, expo-contacts, expo-image-manipulator, expo-image-picker, expo-status-bar (+23 more)

### Community 5 - "Database Core & Schema Management"
Cohesion: 0.12
Nodes (13): crypto, { DatabaseSync }, db, fabricCount, itemsInfo, path, tmplExists, userCount (+5 more)

### Community 6 - "Backend Dependencies & Services"
Cohesion: 0.08
Nodes (25): dependencies, @anthropic-ai/sdk, @aws-sdk/client-s3, axios, cors, dotenv, express, jimp (+17 more)

### Community 7 - "Mobile Assets & Icons Configuration"
Cohesion: 0.08
Nodes (23): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, expo, android, icon (+15 more)

### Community 8 - "File Storage & Paths Configuration"
Cohesion: 0.11
Nodes (16): getThumbBuffer(), inFlight, { Jimp }, path, queue, storage, app, cors (+8 more)

### Community 9 - "Tally ERP Sync Integration"
Cohesion: 0.13
Nodes (18): db, express, { getStockForDesigns }, router, { sendDesignUpdates }, db, express, { getCustomers, getStockBalance, detectMode } (+10 more)

### Community 10 - "Bulk Import Service"
Cohesion: 0.15
Nodes (11): express, { identifyDesign }, multer, router, upload, Anthropic, client, db (+3 more)

### Community 11 - "AI Identification Service"
Cohesion: 0.18
Nodes (10): build, builder, dockerfilePath, deploy, healthcheckPath, healthcheckTimeout, restartPolicyMaxRetries, restartPolicyType (+2 more)

### Community 12 - "PDF Export & Report Generator"
Cohesion: 0.18
Nodes (10): dependencies, axios, dotenv, xml2js, description, main, name, scripts (+2 more)

### Community 13 - "WhatsApp Messaging Integration"
Cohesion: 0.20
Nodes (9): devDependencies, wrangler, name, private, scripts, deploy, dev, start (+1 more)

### Community 14 - "Thumbnail Generation Service"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 15 - "Watermark Processing Engine"
Cohesion: 0.28
Nodes (6): axios, CLOUD_URL, readTallyCustomers(), readTallyStock(), syncOnce(), xml2js

### Community 16 - "Tally Desktop Agent Core"
Cohesion: 0.29
Nodes (6): fs, html, indexPath, path, swDst, swSrc

### Community 17 - "Theme & Styling Constants"
Cohesion: 0.14
Nodes (9): contacts, fs, path, seedPath, tokenArg, useHttp, viaHttp(), fetch() (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (16): Architecture, Backend, Backend (`backend/src/`), Commands, Data model, Deployment, ⚠️ Deployment gotchas (learned the hard way), Environment Variables (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (9): 1. Install Node.js, 2. Copy this folder, 3. Create the settings file, 4. Turn on Tally's connector (one time, in Tally), 5. Start the agent, Gopiram Tally Sync Agent, Keeping it running automatically (optional but recommended), One-time setup (on the shop PC) (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (7): Best Practices (conditional), Cloudflare Workers, Commands, Docs, Errors, Node.js Compatibility, Product Docs

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (6): requireAuth(), crypto, db, express, { requireAuth, requireAdmin }, router

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (5): crypto, db, express, { requireAdmin }, router

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (9): requireAdmin(), db, express, { requireAdmin }, router, db, express, { requireAdmin } (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (8): db, express, { notifyAll }, { requireAuth, requireAdmin }, router, db, notifyAll(), webpush

### Community 28 - "Community 28"
Cohesion: 0.29
Nodes (5): logActivity(), db, express, { requireAdmin, logActivity }, router

### Community 29 - "Community 29"
Cohesion: 0.50
Nodes (3): db, express, router

### Community 30 - "Community 30"
Cohesion: 0.50
Nodes (3): db, express, router

### Community 35 - "Community 35"
Cohesion: 0.50
Nodes (3): db, express, router

## Knowledge Gaps
- **308 isolated node(s):** `docker-entrypoint.sh script`, `name`, `version`, `main`, `start` (+303 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetch()` connect `Theme & Styling Constants` to `Mobile API Client Modules`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `subscribeToPush()` connect `Mobile API Client Modules` to `Theme & Styling Constants`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `docker-entrypoint.sh script`, `name`, `version` to the rest of the system?**
  _308 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Mobile API Client Modules` be split into smaller, more focused modules?**
  _Cohesion score 0.05153099327856609 - nodes in this community are weakly interconnected._
- **Should `Catalog Generation & HTML Services` be split into smaller, more focused modules?**
  _Cohesion score 0.0748663101604278 - nodes in this community are weakly interconnected._
- **Should `Design Management & Uploads` be split into smaller, more focused modules?**
  _Cohesion score 0.058029689608636977 - nodes in this community are weakly interconnected._
- **Should `Mobile Dependencies & Expo Modules` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._