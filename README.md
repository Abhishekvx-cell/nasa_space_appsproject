# ASTRO-NEX
Harmonizes NASA FIRMS MODIS and VIIRS active-fire hotspots into a Burning Activity Calendar (independent project; not affiliated with NASA).

1. **Extract** `ASTRO-NEX.zip`, then `cd ASTRO-NEX`. Requires Node.js 18+.
2. **Install**: `npm install`
3. **API key**: get a free MAP_KEY at https://firms.modaps.eosdis.nasa.gov/api/map_key/
4. **Environment**: `cp .env.example .env` and set `FIRMS_MAP_KEY=...` (server-side only, never sent to the browser). Without a key the app runs on a clearly labelled synthetic DEMONSTRATION dataset (`data/demo_hotspots.csv`, regenerate with `npm run demo-data`).
5. **Run both**: `npm run dev` then open http://localhost:5173
   - Backend only: `npm run server` (port 8787) · Frontend only: `npm run client`
6. Production build: `npm run build`.

Method: records are standardised on the server (`server/index.js`), then aggregated client-side (`src/lib.ts`) into 0.25° cells per day; the unified metric is the number of occupied cells (union of sensors), with raw per-sensor counts kept. Early warning compares the last 7 days with the mean/σ of earlier weeks per 5° tile.

## Deploy as a website (Render)
1. Push these files to a GitHub repo. 2. On render.com choose New > Web Service, connect the repo (render.yaml is detected, or use build `npm install --include=dev && npm run build`, start `npm start`).
3. Add environment variable `FIRMS_MAP_KEY`. 4. Open the `.onrender.com` link. Locally: `npm run build && npm start` serves everything on http://localhost:8787.
