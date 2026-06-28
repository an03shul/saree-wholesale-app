// Post-build step: inject PWA / installable-app tags into the exported
// dist/index.html. Expo's Metro web export produces a minimal HTML head, so we
// add the web manifest link, theme color, and Apple "Add to Home Screen" tags
// here. Idempotent — safe to run on every build.

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('inject-pwa: dist/index.html not found — run `expo export -p web` first.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

const tags = `
    <meta name="description" content="Gopiram Sarees wholesale catalog & orders" />
    <meta name="theme-color" content="#8B1A2B" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Gopiram Sarees" />
    <meta name="mobile-web-app-capable" content="yes" />`;

// Ensure a correct title
html = html.replace(/<title>[^<]*<\/title>/, '<title>Gopiram Sarees</title>');

// Inject the tags once (idempotent)
if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', `${tags}\n  </head>`);
}

// Register service worker for push notifications (idempotent)
const swScript = `
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function(e) {
        console.warn('SW registration failed:', e);
      });
    }
  </script>`;
if (!html.includes("register('/sw.js')")) {
  html = html.replace('</body>', `${swScript}\n</body>`);
}

// Copy sw.js from public/ to dist/ so it's at the root scope
const swSrc = path.join(__dirname, '..', 'public', 'sw.js');
const swDst = path.join(__dirname, '..', 'dist', 'sw.js');
if (fs.existsSync(swSrc)) {
  fs.copyFileSync(swSrc, swDst);
  console.log('inject-pwa: sw.js copied to dist/');
}

fs.writeFileSync(indexPath, html);
console.log('inject-pwa: PWA tags injected into dist/index.html');
