// Generates a DEMONSTRATION dataset (synthetic, seeded). NOT NASA observations.
import fs from "fs";
let s = 42; const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const hubs = [[30.9,75.8],[26.8,81.0],[21.2,79.0],[-12.5,-55],[-4,22],[37.5,-120],[-25,134],[15,102]];
const rows = ["latitude,longitude,brightness,frp,acq_date,sensor,confidence"];
const end = new Date("2025-11-15");
for (let d = 0; d < 180; d++) {
  const dt = new Date(end - d * 864e5), m = dt.getUTCMonth(), iso = dt.toISOString().slice(0, 10);
  for (const [la, lo] of hubs) {
    const peak = la > 0 ? 3 : 9;
    const season = 1 + 2 * Math.exp(-((m - peak) ** 2) / 4) + (la === 30.9 && (m === 9 || m === 10) ? 3 : 0);
    const n = Math.floor(season * (2 + rnd() * 4));
    for (let i = 0; i < n; i++) {
      const v = rnd() < 0.6, la2 = la + (rnd() - .5) * 4, lo2 = lo + (rnd() - .5) * 4;
      rows.push([la2.toFixed(3), lo2.toFixed(3), (300 + rnd() * 60).toFixed(1), (3 + rnd() * 60).toFixed(1), iso, v ? "VIIRS" : "MODIS", v ? ["low","nominal","high"][Math.floor(rnd() * 3)] : Math.floor(30 + rnd() * 70)].join(","));
    }
  }
}
fs.writeFileSync("data/demo_hotspots.csv", rows.join("\n")); console.log(rows.length - 1, "demo rows");
