# One‑Thumb Dodge (iPhone‑friendly PWA game)

A lightweight web game you can play on your iPhone with one thumb. Install it to your Home Screen and it runs full‑screen offline.

## How to play
Drag anywhere on screen to move the ball left/right. Dodge falling blocks, collect coins for +250. One hit = game over. Score increases every second.

## Quick deploy (fastest)
1) Drop the contents of this folder into a new GitHub repo and enable **GitHub Pages** (Settings → Pages → Deploy from branch).
2) Open the Pages URL on your iPhone in Safari.
3) Tap the Share icon → **Add to Home Screen**.
4) Launch from the Home Screen icon for a full‑screen app (offline supported).

Other zero‑config hosts that work: Netlify, Vercel, Cloudflare Pages. Make sure it’s served over HTTPS (required for service workers on iOS).

## Local test (Mac) 
- Run any static server in this folder, e.g.:
  ```bash
  python3 -m http.server 8080
  ```
- Visit http://localhost:8080 (on iPhone use your Mac’s LAN IP).

## Files
- `index.html` – UI shell, canvas, overlays
- `styles.css` – mobile‑first styling (safe‑area aware)
- `game.js` – gameplay loop, touch controls, audio beeps
- `manifest.webmanifest` – PWA metadata
- `service-worker.js` – offline caching
- `icons/` – app icons

## Notes
- iOS requires HTTPS for service workers/PWA. GitHub Pages gives you that automatically.
- First launch should be from Safari; after “Add to Home Screen,” open the icon for the best experience.
- High score and settings are stored on-device with `localStorage`.
