# Gopiram Sarees — public landing page

Static marketing page for the apex domain **gopiramsarees.in** (separate from the
mobile PWA at `app.gopiramsarees.in` and the API at `api.gopiramsarees.in`).

Pure HTML/CSS/JS — no build step.

```
landing/
├── index.html        the page
├── css/style.css     styling (brand maroon #8B1A2B + gold)
├── js/site.js        footer year + sticky header
├── assets/           logo + icons (from the mobile app)
└── images/           drop real saree/model photos here (see images/README.md)
```

## Single-file version for AI Studio (redesigning the frontend)
`gopiram-landing.standalone.html` is the **entire page in one file** — CSS and JS
inlined, logo embedded as a base64 data URI. Paste it into Google AI Studio / v0 /
Claude to redesign the look; nothing else is needed. Only Google Fonts and the
Maps embed load from the network (they have to).

Rebuild it any time after editing the source files:
```bash
python3 build-standalone.py   # → gopiram-landing.standalone.html (~74 KB)
```

## Preview locally
```bash
cd landing
python3 -m http.server 8090
# open http://localhost:8090
```

## Deploy (Cloudflare Pages, same stack as the app)
```bash
npx wrangler pages deploy landing --project-name gopiram-landing
```
Then in the Cloudflare dashboard, add the custom domain **gopiramsarees.in** (and
`www`) to the `gopiram-landing` Pages project. The backend already allows the
`gopiramsarees.in` origin in its CORS allowlist.

## Details to fill in (search the code for `TODO` and `98765 43210`)
- **Phone / WhatsApp** — currently the placeholder `919876543210`. Replace in
  `index.html` (`tel:` links, `wa.me` links, the JSON-LD `telephone`).
- **Address** — the `.visit-addr` block and the JSON-LD `address`.
- **3D map** — the map iframe uses a name search. For an exact pin, open Google
  Maps → the shop → **Share → Embed a map**, copy the `src`, and paste it into the
  `.map-frame iframe` in `index.html`.
- **Hours / established year** — `.visit-hours` and the header tagline.
