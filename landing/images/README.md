# Photos for the landing page

The page ships with maroon/gold placeholder backdrops so it looks finished
immediately. To use real saree/model photos, drop files here with these exact
names — they appear automatically, no code changes needed:

| File          | Where it shows      | Suggested shape         |
|---------------|---------------------|-------------------------|
| `hero.jpg`    | Big top banner      | wide landscape ~1920×1080 |
| `saree-1.jpg` | Collection tile 1   | portrait 3:4 (~800×1067)  |
| `saree-2.jpg` | Collection tile 2   | portrait 3:4            |
| `saree-3.jpg` | Collection tile 3   | portrait 3:4            |
| `saree-4.jpg` | Collection tile 4   | portrait 3:4            |
| `shopfront.png` | 3D storefront card (Visit section) | portrait ~627×1017 |

Your own real photos beat stock/AI for Google Search and Maps ranking.

After adding `shopfront.png`, run `python3 build-standalone.py` so the single-file
version embeds it too.
