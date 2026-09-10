# Garden AI 🌱

Personal garden dashboard — live weather, rain-aware watering, plant tracking, tasks, and a field journal. Local-first: your plants, rain, watering history, tasks, and notes stay on your device.

## Use it

- **Easiest:** open `index.html` in any modern browser. Core garden data works fully offline from a plain file open.
- **Best (PWA):** serve the folder over HTTP(S), then *Install* / *Add to Home Screen*:
  ```sh
  # any static server works, e.g.
  npx serve .
  # then open the printed URL on your phone or desktop
  ```
- Weather uses [Open-Meteo](https://open-meteo.com/) — no API key needed. It refreshes on open/return and when its cache is older than 30 minutes; the last forecast stays available offline.

## PWA / offline notes

- `manifest.json` — app name, theme (`#11180f`), standalone display, `icon-192.png` / `icon-512.png` (maskable) + `icon.svg`.
- `sw.js` — precaches the app shell (HTML, manifest, icons, enhancement scripts), serves navigations offline with a toolkit-loader guard, passes weather API calls through with a cache fallback, and cleans up old caches on activate.
- Note: service workers require HTTP(S) — a `file://` open runs the app fine but without the worker. For the full installable/offline experience, use the static-server step above.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | App UI + inline logic (single file, premium dark theme) |
| `garden-enhancements*.js` | Optional stable/advanced toolkits, loaded via the service worker |
| `manifest.json` | PWA identity + icons |
| `sw.js` | Offline shell + cache management |
| `icon-192.png` / `icon-512.png` / `icon.svg` | Install + home-screen icons |

## Manual test

1. `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'));console.log('manifest OK')"` — manifest parses.
2. `node --check sw.js && echo "sw.js OK"` — worker syntax valid.
3. Open `index.html` from disk — Today/Garden/Water/Weather/Journal/More tabs render, no console errors.
4. Serve over HTTP, open DevTools → Application → Manifest + Service Workers — no errors, icons listed, app installable.
5. Go offline (DevTools → Network → Offline) and reload — shell loads from cache.
