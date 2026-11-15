import express from "express"; import cors from "cors"; import fs from "fs"; import "dotenv/config";
const app = express(); app.use(cors());
const KEY = process.env.FIRMS_MAP_KEY, BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SOURCES = { MODIS: "MODIS_NRT", VIIRS: "VIIRS_SNPP_NRT" };
const CONF = { l: 25, low: 25, n: 60, nominal: 60, h: 90, high: 90 };

// Pipeline steps 1-3: parse CSV, extract common fields, standardise to one schema.
function parse(csv, sensor) {
  const [h, ...lines] = csv.trim().split(/\r?\n/); const c = h.split(",");
  const ix = (n) => c.indexOf(n);
  return lines.filter(Boolean).map((l) => {
    const v = l.split(","); const conf = v[ix("confidence")];
    const bt = parseFloat(v[ix("brightness")] ?? v[ix("bright_ti4")]);
    const frp = parseFloat(v[ix("frp")]);
    return { lat: +v[ix("latitude")], lon: +v[ix("longitude")], date: v[ix("acq_date")], sensor: v[ix("sensor")] || sensor,
      bt: isNaN(bt) ? null : bt, frp: isNaN(frp) ? null : frp,
      conf: isNaN(+conf) ? (CONF[String(conf).toLowerCase()] ?? null) : +conf };
  });
}
async function firms(sensor, bbox, end, days) {
  const out = []; // FIRMS allows max 5 days per request: chunk the window.
  for (let off = 0; off < days; off += 5) {
    const d = new Date(end - off * 864e5).toISOString().slice(0, 10), n = Math.min(5, days - off);
    const r = await fetch(`${BASE}/${KEY}/${SOURCES[sensor]}/${bbox}/${n}/${d}`);
    const t = await r.text();
    if (!r.ok || !t.startsWith("latitude")) throw new Error(`FIRMS ${r.status}: ${t.slice(0, 120)}`);
    out.push(...parse(t, sensor));
  }
  return out;
}
app.get("/api/status", (_q, r) => r.json({ live: !!KEY }));
app.get("/api/hotspots", async (q, r) => {
  const [w, s, e, n] = (q.query.bbox || "-180,-90,180,90").split(",").map(Number);
  const days = Math.min(+q.query.days || 30, 60);
  try {
    if (KEY) {
      const bbox = [w, s, e, n].join(","), end = Date.now();
      const [m, v] = await Promise.all([firms("MODIS", bbox, end, days), firms("VIIRS", bbox, end, days)]);
      const records = [...m, ...v], dates = records.map((x) => x.date).sort();
      return r.json({ demo: false, source: "NASA FIRMS (MODIS_NRT, VIIRS_SNPP_NRT)", from: dates[0], to: dates.at(-1), records });
    }
    const all = parse(fs.readFileSync("data/demo_hotspots.csv", "utf8"), "MODIS").filter((x) => x.lon >= w && x.lon <= e && x.lat >= s && x.lat <= n);
    const dates = all.map((x) => x.date).sort();
    r.json({ demo: true, source: "DEMONSTRATION data (synthetic, not NASA observations)", from: dates[0], to: dates.at(-1), records: all });
  } catch (err) { r.status(502).json({ error: String(err.message || err) }); }
});
app.listen(process.env.PORT || 8787, () => console.log("ASTRO-NEX API on", process.env.PORT || 8787, KEY ? "(live FIRMS)" : "(demo data)"));
