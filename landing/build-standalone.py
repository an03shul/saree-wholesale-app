#!/usr/bin/env python3
"""Bundle the multi-file landing page into ONE self-contained index.html
that you can paste straight into an AI studio (Google AI Studio, v0, Claude,
etc.) to redesign the frontend.

- CSS (css/style.css) is inlined into a <style> tag
- JS  (js/site.js)   is inlined into a <script> tag
- The logo is downscaled to 256px and embedded as a base64 data URI
- The Google Maps embed and Google Fonts stay as external URLs (they must)

Run:  python3 build-standalone.py
Out:  gopiram-landing.standalone.html
"""
import base64, subprocess, tempfile, pathlib

HERE = pathlib.Path(__file__).parent
html = (HERE / "index.html").read_text()
css = (HERE / "css" / "style.css").read_text()
js = (HERE / "js" / "site.js").read_text()

# Downscale the logo so the data URI stays small (it renders at ~52px).
tmp = pathlib.Path(tempfile.gettempdir()) / "gopiram_logo_256.png"
subprocess.run(["sips", "-Z", "256", str(HERE / "assets" / "logo.png"),
                "--out", str(tmp)], check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
logo_uri = "data:image/png;base64," + base64.b64encode(tmp.read_bytes()).decode()

# --- inline everything ---
html = html.replace(
    '<link rel="stylesheet" href="/css/style.css" />',
    f"<style>\n{css}\n  </style>")
html = html.replace(
    '<script src="/js/site.js"></script>',
    f"<script>\n{js}\n  </script>")
html = html.replace('src="/assets/logo.png"', f'src="{logo_uri}"')

# Collapse the whole favicon <link> block down to a single inlined data-URI icon
# so the standalone file has no external /favicon.ico or /assets/*.png references.
import re
html = re.sub(
    r'\n\s*<link rel="(?:icon|apple-touch-icon)"[^>]*>',
    "",
    html)
html = html.replace(
    '<meta name="theme-color" content="#8B1A2B" />',
    '<meta name="theme-color" content="#8B1A2B" />\n'
    f'  <link rel="icon" href="{logo_uri}" />\n'
    f'  <link rel="apple-touch-icon" href="{logo_uri}" />')

# Embed the storefront illustration (if present) so the standalone stays
# self-contained. Drop the external <source> and inline the jpg into the <img>.
shop = HERE / "images" / "shopfront.jpg"
html = re.sub(r'\n\s*<source srcset="/images/shopfront\.webp"[^>]*>', "", html)
if shop.exists():
    shop_uri = "data:image/jpeg;base64," + base64.b64encode(shop.read_bytes()).decode()
    html = html.replace('src="/images/shopfront.jpg"', f'src="{shop_uri}"')
    print("Embedded storefront illustration.")
else:
    print("No images/shopfront.jpg yet — storefront shows the maroon placeholder.")

out = HERE / "gopiram-landing.standalone.html"
out.write_text(html)
print(f"Wrote {out}  ({len(html)//1024} KB)")
