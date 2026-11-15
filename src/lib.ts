export type Rec = { lat: number; lon: number; date: string; sensor: "MODIS" | "VIIRS"; bt: number | null; frp: number | null; conf: number | null };
export type Payload = { demo: boolean; source: string; from: string; to: string; records: Rec[] };
export const REGIONS: Record<string, [number, number, number, number]> = {
  "South Asia (India)": [66, 5, 98, 38], "Western USA": [-125, 31, -102, 49], "Amazon Basin": [-75, -18, -45, 5],
  "Central Africa": [10, -15, 35, 10], "Australia": [112, -44, 154, -10], "Southeast Asia": [92, -10, 110, 24], "World (heavy)": [-180, -90, 180, 90],
};
export const LEVELS = ["Normal", "Elevated", "High", "Critical"] as const;
export const LEVEL_COLOR = ["#34d399", "#facc15", "#f97316", "#ef4444"];
const CELL = 0.25; // harmonization grid (deg): ~VIIRS 375 m and MODIS 1 km pixels both fall inside one cell
export const cellKey = (r: Rec) => `${Math.floor(r.lat / CELL)}:${Math.floor(r.lon / CELL)}`;

export type Day = { date: string; modis: number; viirs: number; cells: number };
/** Harmonized daily series: raw counts kept per sensor; unified metric = occupied grid cells (union of sensors). */
export function daily(rs: Rec[]): Day[] {
  const m = new Map<string, { modis: number; viirs: number; cells: Set<string> }>();
  for (const r of rs) {
    const d = m.get(r.date) ?? { modis: 0, viirs: 0, cells: new Set<string>() };
    r.sensor === "MODIS" ? d.modis++ : d.viirs++; d.cells.add(cellKey(r)); m.set(r.date, d);
  }
  return [...m].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, d]) => ({ date, modis: d.modis, viirs: d.viirs, cells: d.cells.size }));
}
export const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };
export const heatColor = (v: number, q: number[]) => v === 0 ? "#2b3345" : v <= q[0] ? "#fef08a" : v <= q[1] ? "#facc15" : v <= q[2] ? "#f97316" : "#ef4444";
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

export type Alert = { region: string; period: string; current: number; baseline: number; pct: number; z: number; level: number; why: string };
/** Compare last 7 days with the earlier 7-day-window means in each 5-degree tile (baseline = mean/std of loaded history). */
export function anomalies(rs: Rec[], to: string): Alert[] {
  const tiles = new Map<string, Rec[]>();
  for (const r of rs) { const k = `${Math.floor(r.lat / 5) * 5},${Math.floor(r.lon / 5) * 5}`; (tiles.get(k) ?? tiles.set(k, []).get(k)!).push(r); }
  const end = new Date(to).getTime(), out: Alert[] = [];
  for (const [k, rr] of tiles) {
    const win: number[] = [];
    const nW = Math.floor((rr.length ? (end - Math.min(...rr.map((r) => +new Date(r.date)))) / 864e5 + 1 : 0) / 7);
    if (nW < 3) continue;
    for (let w = 0; w < nW; w++) {
      const hi = end - w * 7 * 864e5, lo = hi - 7 * 864e5;
      win.push(new Set(rr.filter((r) => { const t = +new Date(r.date); return t > lo && t <= hi; }).map(cellKey)).size / 7 * 7);
    }
    const cur = win[0], base = win.slice(1), b = mean(base), s = Math.max(sd(base), 1), z = (cur - b) / s;
    if (cur === 0 && b === 0) continue;
    const level = z >= 3 ? 3 : z >= 2 ? 2 : z >= 1 ? 1 : 0;
    out.push({ region: `Tile ${k.split(",")[0]}°N, ${k.split(",")[1]}°E (5°)`, period: "last 7 days", current: cur, baseline: +b.toFixed(1), pct: b ? Math.round(((cur - b) / b) * 100) : 100, z: +z.toFixed(2), level,
      why: `Occupied 0.25° cells this week are ${z.toFixed(1)} standard deviations ${z >= 0 ? "above" : "below"} the mean of ${base.length} earlier weeks (σ≥1).` });
  }
  return out.sort((a, b) => b.z - a.z);
}
export function toCsv(rs: Rec[]) {
  const t = "latitude,longitude,date,sensor,brightness_K,frp_MW,confidence\n" + rs.map((r) => [r.lat, r.lon, r.date, r.sensor, r.bt ?? "", r.frp ?? "", r.conf ?? ""].join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/csv" })); a.download = "astro-nex-hotspots.csv"; a.click();
}
