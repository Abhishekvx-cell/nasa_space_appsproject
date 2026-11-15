import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Rec, Payload, REGIONS, LEVELS, LEVEL_COLOR, daily, quantile, heatColor, anomalies, toCsv } from "./lib";

const TABS = ["Dashboard", "Global Map", "Burning Calendar", "Historical Analysis", "Harmonization", "Early Warning", "About"];
const SC = { MODIS: "#22d3ee", VIIRS: "#f97316" };
const Card = ({ t, children, tip }: { t: string; children: React.ReactNode; tip?: string }) => <section className="glass p-4"><h3 className="mb-3 text-sm font-semibold text-slate-300" title={tip}>{t}{tip && " ⓘ"}</h3>{children}</section>;
const Stat = ({ l, v }: { l: string; v: string | number }) => <div className="glass p-4"><div className="text-xs text-slate-400">{l}</div><div className="mt-1 text-2xl font-bold text-orange-400">{v}</div></div>;
const Empty = () => <div className="py-10 text-center text-slate-400">No hotspots match these filters. Widen the date range, choose another sensor or pick a different area.</div>;
const Logo = () => <div className="flex items-center gap-2"><img src="/logo.svg" className="h-9 w-9" alt=""/><span className="text-xl font-extrabold tracking-wide">ASTRO<span className="text-cyan-400">-NEX</span></span></div>;

function Fly({ to }: { to: [number, number] | null }) { const m = useMap(); useEffect(() => { if (to) m.flyTo(to, 8); }, [to, m]); return null; }

export default function App() {
  const [tab, setTab] = useState(0), [menu, setMenu] = useState(false);
  const [region, setRegion] = useState("South Asia (India)"), [bbox, setBbox] = useState(REGIONS["South Asia (India)"]);
  const [days, setDays] = useState(30), [sensor, setSensor] = useState("All"), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [data, setData] = useState<Payload | null>(null), [err, setErr] = useState(""), [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null), [fly, setFly] = useState<[number, number] | null>(null), [q, setQ] = useState("");
  const [ym, setYm] = useState("");

  useEffect(() => {
    setLoading(true); setErr("");
    fetch(`/api/hotspots?bbox=${bbox.join(",")}&days=${days}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as Payload; })
      .then((j) => { setData(j); setFrom(j.from ?? ""); setTo(j.to ?? ""); setYm((j.to ?? "").slice(0, 7)); }).catch((e) => setErr(String(e.message))).finally(() => setLoading(false));
  }, [bbox, days]);

  const recs = useMemo(() => (data?.records ?? []).filter((r) => (sensor === "All" || r.sensor === sensor) && (!from || r.date >= from) && (!to || r.date <= to)), [data, sensor, from, to]);
  const series = useMemo(() => daily(recs), [recs]);
  const modis = recs.filter((r) => r.sensor === "MODIS").length, viirs = recs.length - modis;
  const qs = useMemo(() => { const nz = series.map((d) => d.cells).filter(Boolean); return [quantile(nz, .25), quantile(nz, .5), quantile(nz, .8)]; }, [series]);
  const alerts = useMemo(() => (data ? anomalies(data.records.filter((r) => sensor === "All" || r.sensor === sensor), data.to) : []), [data, sensor]);
  const monthly = useMemo(() => { const m: Record<string, { m: string; MODIS: number; VIIRS: number }> = {};
    recs.forEach((r) => { const k = r.date.slice(0, 7); (m[k] ??= { m: k, MODIS: 0, VIIRS: 0 })[r.sensor]++; }); return Object.values(m).sort((a, b) => (a.m < b.m ? -1 : 1)); }, [recs]);

  const search = async () => { try { const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`)).json(); if (r[0]) setFly([+r[0].lat, +r[0].lon]); else setErr("Location not found."); } catch { setErr("Location search failed (needs internet)."); } };
  const setBox = (i: number, v: string) => { const b = [...bbox] as typeof bbox; b[i] = +v; setBbox(b); setRegion("Custom"); };

  const Filters = (
    <div className="glass mb-4 flex flex-wrap items-center gap-2 p-3 text-sm">
      <select aria-label="Area" value={region} onChange={(e) => { setRegion(e.target.value); if (REGIONS[e.target.value]) setBbox(REGIONS[e.target.value]); }}>{[...Object.keys(REGIONS), "Custom"].map((r) => <option key={r}>{r}</option>)}</select>
      {["W", "S", "E", "N"].map((l, i) => <input key={l} aria-label={l} title={`${l} bound (lon/lat)`} className="w-20" type="number" value={bbox[i]} onChange={(e) => setBox(i, e.target.value)} />)}
      <select aria-label="Sensor" value={sensor} onChange={(e) => setSensor(e.target.value)}>{["All", "MODIS", "VIIRS"].map((s) => <option key={s} value={s}>{s === "All" ? "All Sensors" : s}</option>)}</select>
      <select aria-label="Days to load" value={days} onChange={(e) => setDays(+e.target.value)}>{[10, 30, 60].map((d) => <option key={d} value={d}>last {d} days</option>)}</select>
      <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} />
      <button className="rounded-lg bg-orange-500 px-3 py-1.5 font-semibold text-black" onClick={() => recs.length ? toCsv(recs) : setErr("Nothing to export.")}>Download CSV</button>
    </div>);

  const months = [...new Set(series.map((d) => d.date.slice(0, 7)))];
  const calDays = useMemo(() => { if (!ym) return []; const [y, m] = ym.split("-").map(Number), n = new Date(y, m, 0).getDate(), map = new Map(series.map((d) => [d.date, d]));
    return Array.from({ length: n }, (_, i) => { const date = `${ym}-${String(i + 1).padStart(2, "0")}`; return map.get(date) ?? { date, modis: 0, viirs: 0, cells: 0 }; }); }, [ym, series]);
  const lead = ym ? new Date(`${ym}-01`).getUTCDay() : 0;

  return (
    <div className="mx-auto max-w-7xl p-3 md:p-6">
      <header className="mb-4 flex items-center justify-between"><Logo />
        <button className="md:hidden glass px-3 py-1" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
        <nav className={`${menu ? "flex" : "hidden"} absolute right-3 top-14 z-[1000] flex-col gap-1 glass p-2 md:static md:flex md:flex-row md:border-0 md:bg-transparent`}>
          {TABS.map((t, i) => <button key={t} onClick={() => { setTab(i); setMenu(false); }} className={`rounded-lg px-3 py-1.5 text-sm ${tab === i ? "bg-orange-500 text-black" : "hover:bg-slate-700/50"}`}>{t}</button>)}</nav></header>

      {data?.demo && <div className="mb-3 rounded-lg border border-yellow-500 bg-yellow-500/10 p-2 text-sm text-yellow-300">⚠ DEMONSTRATION DATA — synthetic, not NASA observations. Add a FIRMS MAP_KEY to .env to load real MODIS/VIIRS detections.</div>}
      {err && <div role="alert" className="mb-3 rounded-lg border border-red-500 bg-red-500/10 p-2 text-sm text-red-300">{err} <button className="underline" onClick={() => setErr("")}>dismiss</button></div>}
      {tab !== 4 && tab !== 6 && Filters}
      {loading ? <div className="py-24 text-center text-orange-300 animate-pulse">Loading satellite observations…</div> : <>

      {tab === 0 && <>
        <h1 className="text-3xl font-extrabold md:text-4xl">Understanding Earth's Burning Activity</h1>
        <p className="mb-4 mt-1 text-slate-400">Explore, analyze and anticipate global fire patterns through harmonized satellite observations.</p>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat l="Total Active Fire Hotspots" v={recs.length.toLocaleString()} /><Stat l="MODIS Hotspots" v={modis.toLocaleString()} /><Stat l="VIIRS Hotspots" v={viirs.toLocaleString()} />
          <Stat l="Regions with High Fire Activity" v={alerts.filter((a) => a.level >= 2).length} /><Stat l="Observation Period" v={from && to ? `${from} → ${to}` : "—"} /></div>
        {recs.length === 0 ? <Empty /> : <div className="grid gap-4 md:grid-cols-2">
          <Card t="Global fire activity map"><FireMap recs={recs} fly={null} h={300} /></Card>
          <Card t="Historical fire trend (unified daily cells)"><ResponsiveContainer height={300}><LineChart data={series}><CartesianGrid stroke="#22324f" /><XAxis dataKey="date" hide /><YAxis /><Tooltip /><Line dataKey="cells" stroke="#f97316" dot={false} name="Occupied cells" /></LineChart></ResponsiveContainer></Card>
          <Card t="Sensor distribution"><ResponsiveContainer height={240}><PieChart><Pie data={[{ n: "MODIS", v: modis }, { n: "VIIRS", v: viirs }]} dataKey="v" nameKey="n" label>{["MODIS", "VIIRS"].map((s) => <Cell key={s} fill={SC[s as "MODIS"]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></Card>
          <Card t="High-activity regions">{alerts.slice(0, 5).map((a) => <div key={a.region} className="flex justify-between border-b border-slate-700 py-1 text-sm"><span>{a.region}</span><b style={{ color: LEVEL_COLOR[a.level] }}>{LEVELS[a.level]} ({a.pct}%)</b></div>)}{!alerts.length && <p className="text-sm text-slate-400">Not enough history yet (needs ≥3 weeks).</p>}</Card>
          <Card t="Recent fire activity (latest 7 days)"><div className="text-sm">{series.slice(-7).map((d) => <div key={d.date} className="flex justify-between"><span>{d.date}</span><span>MODIS {d.modis} · VIIRS {d.viirs}</span></div>)}</div></Card>
          <Card t="Data source"><p className="text-sm text-slate-300">{data?.source}<br />Period: {data?.from} → {data?.to}. Hotspots are satellite detections of thermal anomalies, not confirmed fires or burned area.</p></Card></div>}</>}

      {tab === 1 && (recs.length ? <><div className="mb-2 flex gap-2"><input className="flex-1" placeholder="Search a place…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} /><button className="glass px-3" onClick={search}>Search</button></div>
        <FireMap recs={recs} fly={fly} h={560} /></> : <Empty />)}

      {tab === 2 && <Card t="Burning Activity Calendar" tip="Each day colored by number of harmonized 0.25° cells containing ≥1 hotspot.">
        <div className="mb-3 flex flex-wrap items-center gap-3"><select value={ym} onChange={(e) => { setYm(e.target.value); setSel(null); }}>{months.map((m) => <option key={m}>{m}</option>)}</select>
          <Legend2 q={qs} /></div>
        {!months.length ? <Empty /> : <>
        <div className="grid max-w-xl grid-cols-7 gap-1 text-center text-xs">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="text-slate-400">{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={"e" + i} />)}
          {calDays.map((d) => <button key={d.date} onClick={() => setSel(d.date)} title={`${d.date}: ${d.cells} cells · MODIS ${d.modis} · VIIRS ${d.viirs}`} style={{ background: heatColor(d.cells, qs) }} className={`aspect-square rounded text-black ${sel === d.date ? "ring-2 ring-cyan-300" : ""}`}>{+d.date.slice(8)}</button>)}</div>
        {sel && <div className="mt-4"><h4 className="mb-1 font-semibold">{sel}: {recs.filter((r) => r.date === sel).length} observations</h4>
          <div className="max-h-64 overflow-auto text-xs"><table className="w-full"><thead><tr className="text-left text-slate-400"><th>Lat</th><th>Lon</th><th>Sensor</th><th>FRP</th><th>Conf</th></tr></thead><tbody>
            {recs.filter((r) => r.date === sel).slice(0, 200).map((r, i) => <tr key={i}><td>{r.lat}</td><td>{r.lon}</td><td>{r.sensor}</td><td>{r.frp ?? "–"}</td><td>{r.conf ?? "–"}</td></tr>)}</tbody></table></div></div>}</>}</Card>}

      {tab === 3 && (recs.length ? <div className="grid gap-4 md:grid-cols-2">
        <Card t="Monthly hotspot counts by sensor (month/year comparison)"><ResponsiveContainer height={280}><BarChart data={monthly}><CartesianGrid stroke="#22324f" /><XAxis dataKey="m" /><YAxis /><Tooltip /><Legend /><Bar dataKey="MODIS" fill={SC.MODIS} /><Bar dataKey="VIIRS" fill={SC.VIIRS} /></BarChart></ResponsiveContainer></Card>
        <Card t="Daily trend: MODIS vs VIIRS raw counts"><ResponsiveContainer height={280}><LineChart data={series}><CartesianGrid stroke="#22324f" /><XAxis dataKey="date" hide /><YAxis /><Tooltip /><Legend /><Line dataKey="modis" stroke={SC.MODIS} dot={false} /><Line dataKey="viirs" stroke={SC.VIIRS} dot={false} /></LineChart></ResponsiveContainer></Card>
        <Card t="Peak burning days (unified cells)">{[...series].sort((a, b) => b.cells - a.cells).slice(0, 8).map((d) => <div key={d.date} className="flex justify-between border-b border-slate-700 py-1 text-sm"><span>{d.date}</span><b className="text-orange-400">{d.cells} cells</b></div>)}</Card>
        <Card t="Seasonality note"><p className="text-sm text-slate-300">Seasonal patterns need multi-year data. Loaded window: {series.length} days. Load a longer period (FIRMS archive) or compare months above.</p></Card></div> : <Empty />)}

      {tab === 4 && <div className="grid gap-4"><Card t="Harmonization pipeline"><div className="grid gap-2 md:grid-cols-4">
        {["Load MODIS + VIIRS active fire records", "Extract common fields (lat, lon, date, sensor, FRP, confidence)", "Standardize timestamps, units, confidence scale", "Filter by area and date", "Aggregate to 0.25° cells per day (union of sensors)", "Preserve sensor identity in every record", "Compute unified activity statistics", "Visualize: map, calendar, charts"].map((s, i) => <div key={i} className="glass relative p-3 text-sm"><b className="text-orange-400">{i + 1}.</b> {s}</div>)}</div></Card>
        <div className="grid gap-4 md:grid-cols-2"><Card t="MODIS"><p className="text-sm">Moderate Resolution Imaging Spectroradiometer on Terra and Aqua. Active fire product ≈1 km nominal resolution.</p></Card>
          <Card t="VIIRS"><p className="text-sm">Visible Infrared Imaging Radiometer Suite on Suomi NPP, NOAA-20, NOAA-21. Active fire product ≈375 m nominal resolution. This build loads VIIRS_SNPP_NRT.</p></Card></div>
        <Card t="Method and caveats"><ul className="list-disc space-y-1 pl-5 text-sm text-slate-300"><li>Raw counts are <b>not</b> equivalent: VIIRS detects more, smaller fires per area. Both are shown separately.</li><li>The unified metric counts occupied 0.25° cells, so one fire seen by both sensors counts once and pixel size matters less.</li><li>Overpass times differ, so same-day detections are not simultaneous.</li><li>Hotspots are thermal anomalies, not burned area.</li></ul></Card>
        <Card t="Current dataset"><p className="text-sm">{data ? `${data.records.length.toLocaleString()} records → ${series.length} days → harmonized cells/day (max ${Math.max(0, ...series.map((d) => d.cells))}).` : "—"}</p></Card></div>}

      {tab === 5 && <Card t="Early warning indicators" tip="Last 7 days vs mean and standard deviation of earlier weeks, per 5° tile. Analytical only.">
        {alerts.length ? <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-slate-400"><th>Level</th><th>Region</th><th>Period</th><th>Current</th><th>Baseline</th><th>Diff</th><th>Explanation</th></tr></thead><tbody>
          {alerts.slice(0, 20).map((a) => <tr key={a.region} className="border-t border-slate-700"><td><b style={{ color: LEVEL_COLOR[a.level] }}>{LEVELS[a.level]}</b></td><td>{a.region}</td><td>{a.period}</td><td>{a.current}</td><td>{a.baseline}</td><td>{a.pct}%</td><td className="text-xs text-slate-400">{a.why}</td></tr>)}</tbody></table></div>
          : <p className="text-slate-400">Needs at least 3 weeks of history. Increase “days loaded” to 30 or 60.</p>}
        <p className="mt-3 text-xs text-slate-400">Z &lt;1 Normal, 1–2 Elevated, 2–3 High, ≥3 Critical. These are statistical indicators, not forecasts or official emergency warnings.</p></Card>}

      {tab === 6 && <div className="glass space-y-3 p-5 text-slate-300"><h2 className="text-2xl font-bold">About ASTRO-NEX</h2>
        <p>Fire hotspots come from several satellite sensors with different resolutions and overpass times, so their records cannot be compared directly. ASTRO-NEX harmonizes MODIS and VIIRS active fire detections from NASA FIRMS into one Burning Activity Calendar, helping responders, researchers and land managers see recurring high-activity periods and unusual increases.</p>
        <p>Data: NASA FIRMS (firms.modaps.eosdis.nasa.gov), MODIS_NRT and VIIRS_SNPP_NRT. Limitations: cloud and smoke obscure fires, small or short fires are missed, overpasses are a few times per day, and hotspots are not burned area. ASTRO-NEX is an independent project and is not affiliated with or endorsed by NASA.</p></div>}
      </>}
    </div>);
}

function Legend2({ q }: { q: number[] }) {
  return <div className="flex items-center gap-2 text-xs">{[["#2b3345", "None"], ["#fef08a", `Low ≤${q[0]}`], ["#facc15", `Moderate ≤${q[1]}`], ["#f97316", `High ≤${q[2]}`], ["#ef4444", "Extreme"]].map(([c, l]) => <span key={l} className="flex items-center gap-1"><i style={{ background: c }} className="inline-block h-3 w-3 rounded" />{l}</span>)}</div>;
}
function FireMap({ recs, fly, h }: { recs: Rec[]; fly: [number, number] | null; h: number }) {
  const shown = recs.length > 3000 ? recs.filter((_, i) => i % Math.ceil(recs.length / 3000) === 0) : recs;
  const c: [number, number] = recs.length ? [recs[0].lat, recs[0].lon] : [20, 78];
  return <div><div style={{ height: h }}><MapContainer center={c} zoom={4} style={{ height: "100%" }}>
    <TileLayer attribution="© OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" /><Fly to={fly} />
    {shown.map((r, i) => <CircleMarker key={i} center={[r.lat, r.lon]} radius={r.sensor === "VIIRS" ? 3 : 5} pathOptions={{ color: SC[r.sensor], fillColor: (r.frp ?? 0) > 40 ? "#ef4444" : SC[r.sensor], fillOpacity: .7, weight: 1 }}>
      <Popup>Lat {r.lat}, Lon {r.lon}<br />Date {r.date}<br />Sensor {r.sensor}<br />Brightness {r.bt ?? "n/a"} K<br />FRP {r.frp ?? "n/a"} MW<br />Confidence {r.conf ?? "n/a"}</Popup></CircleMarker>)}</MapContainer></div>
    <p className="mt-1 text-xs text-slate-400"><span style={{ color: SC.MODIS }}>● MODIS (1 km)</span> · <span style={{ color: SC.VIIRS }}>● VIIRS (375 m)</span> · <span className="text-red-400">● FRP &gt; 40 MW</span>{recs.length > 3000 && ` · showing ${shown.length} of ${recs.length} (evenly sampled)`}</p></div>;
}
