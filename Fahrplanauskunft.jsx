import { useState, useEffect, useCallback } from "react";

// ─── KONSTANTEN ──────────────────────────────────────────────────────────────
const EV_START = 11, EV_END = 20;
const SHOW_FROM = 12, SHOW_TO = 20;
const LC = {
  RE7:  { bg: "#1a3a6e", fg: "#7eb8f7", bd: "#2a5aae" },
  RE72: { bg: "#1e3a1e", fg: "#7ecf7e", bd: "#2e6a2e" },
  RE74: { bg: "#3a1a3a", fg: "#cf7ecf", bd: "#6a2e6a" },
  RB73: { bg: "#3a2a1a", fg: "#cfa87e", bd: "#6a4e2e" },
  RB75: { bg: "#1a3a3a", fg: "#7ecfcf", bd: "#2e6a6a" },
};
const trackLabel = code => { if (!code) return ""; const m = code.match(/(\d[\d\-a-z]*)$/i); return m ? m[1] : code; };
const pad2 = n => String(Math.floor(n)).padStart(2, "0");
const toHHMM = m => `${pad2(m / 60)}:${pad2(m % 60)}`;

// ─── HILFSFUNKTIONEN ─────────────────────────────────────────────────────────
function validHour(svc, h) {
  if (h < (svc.minHour ?? EV_START)) return false;
  if (svc.maxHour !== undefined && h > svc.maxHour) return false;
  if (svc.excludeHours?.includes(h)) return false;
  return true;
}
function schedTime(svc, h, si, isArr) {
  const s = svc.stops[si];
  return h * 60 + svc.base + (isArr ? (s.arr ?? s.dep ?? 0) : (s.dep ?? s.arr ?? 0));
}
function effectiveTime(svc, h, si, isArr, delays) {
  const sched = schedTime(svc, h, si, isArr);
  const d = delays[`${svc.id}_h${h}`];
  if (!d?.min) return { time: sched, delay: 0 };
  const ri = svc.stops.findIndex(s => s.sid === d.sid);
  if (ri === -1 || si < ri) return { time: sched, delay: 0 };
  return { time: sched + d.min, delay: d.min };
}
function tripMeta(svc, h, delays) {
  const d = delays[`${svc.id}_h${h}`] ?? {};
  return {
    delay: d.min ?? 0,
    delaySid: d.sid ?? "",
    delayReason: d.reason ?? "",
    trackChanges: d.trackChanges ?? {},
    cancelledStops: d.cancelledStops ?? [],
    extraStops: d.extraStops ?? [],
  };
}
function getDeps(sid, delays) {
  const list = [];
  for (const svc of SVCS) {
    const si = svc.stops.findIndex(s => s.sid === sid && s.passenger !== false);
    if (si === -1 || svc.stops[si].dep === undefined) continue;
    for (let h = EV_START; h <= EV_END; h++) {
      if (!validHour(svc, h)) continue;
      const sched = schedTime(svc, h, si, false);
      if (sched < SHOW_FROM * 60 || sched > SHOW_TO * 60) continue;
      const { time, delay } = effectiveTime(svc, h, si, false, delays);
      const meta = tripMeta(svc, h, delays);
      list.push({ svc, h, si, stop: svc.stops[si], sched, time, delay, meta });
    }
  }
  return list.sort((a, b) => a.sched - b.sched);
}
function getConns(fromSid, toSid, delays) {
  const list = [];
  for (const svc of SVCS) {
    const fi = svc.stops.findIndex(s => s.sid === fromSid && s.passenger !== false);
    const ti = svc.stops.findIndex(s => s.sid === toSid && s.passenger !== false);
    if (fi === -1 || ti === -1 || fi >= ti) continue;
    for (let h = EV_START; h <= EV_END; h++) {
      if (!validHour(svc, h)) continue;
      const depS = schedTime(svc, h, fi, false);
      if (depS < SHOW_FROM * 60 || depS > SHOW_TO * 60) continue;
      const { time: dep, delay: dd } = effectiveTime(svc, h, fi, false, delays);
      const { time: arr, delay: ad } = effectiveTime(svc, h, ti, true, delays);
      const meta = tripMeta(svc, h, delays);
      list.push({ svc, h, dep, arr, depS, dd, ad, dur: Math.round(arr - dep), meta });
    }
  }
  return list.sort((a, b) => a.dep - b.dep);
}

// ─── FAHRPLANDATEN ───────────────────────────────────────────────────────────
const SVCS = [
  { id:"re7_nfl", line:"RE7", name:"RE7 (FL-Zugteil)", dir:"Flensburg", base:32, minHour:13, stops:[
    { sid:"nms",       name:"Neumünster",         track:"AN3",    dep:0 },
    { sid:"flintbek",  name:"Flintbek",           track:"",       arr:12, dep:12, passenger:false },
    { sid:"amr",       name:"Kiel-Meimersdorf",   track:"AMR",    arr:18, dep:18, passenger:false },
    { sid:"kh",        name:"Kiel-Hassee",         track:"AKH3",   arr:21, dep:22, passenger:false },
    { sid:"such",      name:"Suchsdorf",           track:"ASU2",   arr:26, dep:26, passenger:false },
    { sid:"anw",       name:"Neuwittenbek",        track:"ANW2",   arr:30, dep:30, passenger:false },
    { sid:"gtf",       name:"Gettorf",             track:"AGF1",   arr:35, dep:37 },
    { sid:"sue",       name:"Süderbrarup",         track:"ASUE1",  arr:65, dep:68 },
    { sid:"fl",        name:"Flensburg",           track:"AF5",    arr:92 },
  ]},
  { id:"re7_fln_13", line:"RE7", name:"RE7 (FL-Zugteil, Normalweg)", dir:"Neumünster", base:15, minHour:13, maxHour:13, stops:[
    { sid:"fl",    name:"Flensburg",   track:"AF2",   dep:0 },
    { sid:"tarp",  name:"Tarp",        track:"2",     arr:8,  dep:9 },
    { sid:"jue",   name:"Jübek",       track:"AJ1",   arr:15, dep:16 },
    { sid:"sch",   name:"Schleswig",   track:"ASW3",  arr:23, dep:24 },
    { sid:"ows",   name:"Owschlag",    track:"AOS3",  arr:31, dep:32 },
    { sid:"rbs",   name:"Rendsburg",   track:"AR1",   arr:40, dep:41 },
    { sid:"nor",   name:"Nortorf",     track:"ANF2",  arr:56, dep:56 },
    { sid:"nms",   name:"Neumünster",  track:"AN5",   arr:67 },
  ]},
  { id:"re7_fln", line:"RE7", name:"RE7 (FL-Zugteil)", dir:"Neumünster", base:15, minHour:14, stops:[
    { sid:"fl",        name:"Flensburg",         track:"AF5",   dep:0 },
    { sid:"sue",       name:"Süderbrarup",        track:"ASUE2", arr:23, dep:25 },
    { sid:"gtf",       name:"Gettorf",            track:"AGF2",  arr:51, dep:53 },
    { sid:"anw",       name:"Neuwittenbek",       track:"ANW2",  arr:56, dep:56, passenger:false },
    { sid:"such",      name:"Suchsdorf",          track:"ASU2",  arr:61, dep:61, passenger:false },
    { sid:"kh",        name:"Kiel-Hassee",        track:"AKH3",  arr:65, dep:65, passenger:false },
    { sid:"amr",       name:"Kiel-Meimersdorf",  track:"AMR",   arr:70, dep:70, passenger:false },
    { sid:"flintbek",  name:"Flintbek",           track:"",      arr:75, dep:75, passenger:false },
    { sid:"abrd",      name:"Bordesholm",         track:"ABRD1", arr:81, dep:81, passenger:false },
    { sid:"einfeld",   name:"Einfeld",            track:"",      arr:84, dep:84, passenger:false },
    { sid:"nms",       name:"Neumünster",         track:"AN5",   arr:91 },
  ]},
  { id:"rb73_ke", line:"RB73", name:"RB73", dir:"Eckernförde", base:12, minHour:13, stops:[
    { sid:"kiel", name:"Kiel Hbf",              track:"AK6a", dep:0 },
    { sid:"kh",   name:"Kiel-Hassee CITTI-Park", track:"AKH2", arr:3,  dep:9 },
    { sid:"kron", name:"Kronshagen",             track:"",     arr:12, dep:13 },
    { sid:"such", name:"Suchsdorf",              track:"ASU2", arr:15, dep:16 },
    { sid:"anw",  name:"Neuwittenbek",           track:"ANW1", arr:21, dep:24, passenger:false },
    { sid:"gtf",  name:"Gettorf",                track:"AGF1", arr:28, dep:29 },
    { sid:"eck",  name:"Eckernförde",            track:"AEC3", arr:38 },
  ]},
  { id:"rb73_ek", line:"RB73", name:"RB73", dir:"Kiel Hbf", base:20, minHour:13, stops:[
    { sid:"eck",  name:"Eckernförde",            track:"AEC3", dep:0 },
    { sid:"gtf",  name:"Gettorf",                track:"AGF2", arr:8,  dep:10 },
    { sid:"anw",  name:"Neuwittenbek",           track:"ANW2", arr:15, dep:15, passenger:false },
    { sid:"such", name:"Suchsdorf",              track:"ASU2", arr:18, dep:19 },
    { sid:"kron", name:"Kronshagen",             track:"",     arr:21, dep:22 },
    { sid:"kh",   name:"Kiel-Hassee CITTI-Park", track:"AKH2", arr:25, dep:27 },
    { sid:"kiel", name:"Kiel Hbf",              track:"AK6b", arr:31 },
  ]},
  { id:"rb75_kr", line:"RB75", name:"RB75", dir:"Rendsburg", base:40, minHour:13, stops:[
    { sid:"kiel",     name:"Kiel Hbf",  track:"AK6a", dep:0 },
    { sid:"flintbek", name:"Flintbek",  track:"",     arr:6,  dep:6,  passenger:false },
    { sid:"abrd",     name:"Bordesholm",track:"ABRD1",arr:11, dep:11, passenger:false },
    { sid:"einfeld",  name:"Einfeld",   track:"",     arr:14, dep:14, passenger:false },
    { sid:"nms",      name:"Neumünster",track:"AN",   arr:21, dep:26 },
    { sid:"nor",      name:"Nortorf",   track:"ANF1", arr:36, dep:37 },
    { sid:"aon",      name:"Osterrönfeld",track:"AON2",arr:46, dep:46, passenger:false },
    { sid:"rbs",      name:"Rendsburg", track:"AR2",  arr:61 },
  ]},
  { id:"rb75_rk", line:"RB75", name:"RB75", dir:"Kiel Hbf", base:51, minHour:13, stops:[
    { sid:"rbs",      name:"Rendsburg", track:"AR2",   dep:0 },
    { sid:"aon",      name:"Osterrönfeld",track:"AON1",arr:9,  dep:9,  passenger:false },
    { sid:"nor",      name:"Nortorf",   track:"ANF2",  arr:14, dep:15 },
    { sid:"nms",      name:"Neumünster",track:"AN",    arr:26, dep:31 },
    { sid:"einfeld",  name:"Einfeld",   track:"",      arr:35, dep:35, passenger:false },
    { sid:"abrd",     name:"Bordesholm",track:"ABRD2", arr:39, dep:39, passenger:false },
    { sid:"flintbek", name:"Flintbek",  track:"",      arr:43, dep:43, passenger:false },
    { sid:"kiel",     name:"Kiel Hbf", track:"AK6a",  arr:50 },
  ]},
  { id:"re72_kf", line:"RE72", name:"RE72", dir:"Flensburg", base:44, minHour:13, stops:[
    { sid:"kiel",      name:"Kiel Hbf",          track:"AK6a",   dep:0 },
    { sid:"kh",        name:"Kiel-Hassee",        track:"AKH3",   arr:3,  dep:3,  passenger:false },
    { sid:"afeb",      name:"Felde-Brandsbek",    track:"AFEB2",  arr:11, dep:11 },
    { sid:"bredenbek", name:"Bredenbek",          track:"",       arr:14, dep:14, passenger:false },
    { sid:"aon175",    name:"Osterrönfeld (175)", track:"AON175", arr:22, dep:22, passenger:false },
    { sid:"rbs",       name:"Rendsburg",          track:"AR 3-4", arr:30, dep:31 },
    { sid:"sch",       name:"Schleswig",          track:"ASW1",   arr:49, dep:50 },
    { sid:"jue",       name:"Jübek",              track:"AJ2",    arr:57, dep:58 },
    { sid:"fl",        name:"Flensburg",          track:"AF4",    arr:75 },
  ]},
  { id:"re72_fk", line:"RE72", name:"RE72", dir:"Kiel Hbf", base:4, minHour:13, stops:[
    { sid:"fl",        name:"Flensburg",          track:"AF4",    dep:0 },
    { sid:"jue",       name:"Jübek",              track:"AJ1",    arr:15, dep:17 },
    { sid:"sch",       name:"Schleswig",          track:"ASW3",   arr:25, dep:27 },
    { sid:"ows",       name:"Owschlag",           track:"AOS3",   arr:36, dep:38 },
    { sid:"rbs",       name:"Rendsburg",          track:"AR1",    arr:47, dep:51 },
    { sid:"aon175",    name:"Osterrönfeld (175)", track:"AON175", arr:64, dep:64, passenger:false },
    { sid:"bredenbek", name:"Bredenbek",          track:"",       arr:72, dep:72, passenger:false },
    { sid:"afeb",      name:"Felde-Brandsbek",    track:"AFEB1",  arr:76, dep:77 },
    { sid:"kh",        name:"Kiel-Hassee",        track:"AKH2",   arr:85, dep:85, passenger:false },
    { sid:"kiel",      name:"Kiel Hbf",          track:"AK6a",   arr:90 },
  ]},
  { id:"re74_kh", line:"RE74", name:"RE74", dir:"Husum", base:8, minHour:13, stops:[
    { sid:"kiel",      name:"Kiel Hbf",          track:"AK6b",   dep:0 },
    { sid:"kh",        name:"Kiel-Hassee",        track:"AKH2",   arr:4,  dep:4,  passenger:false },
    { sid:"afeb",      name:"Felde-Brandsbek",    track:"AFEB2",  arr:12, dep:13 },
    { sid:"bredenbek", name:"Bredenbek",          track:"",       arr:16, dep:16, passenger:false },
    { sid:"aon175",    name:"Osterrönfeld (175)", track:"AON175", arr:24, dep:24, passenger:false },
    { sid:"rbs",       name:"Rendsburg",          track:"AR3",    arr:32, dep:33 },
    { sid:"ows",       name:"Owschlag",           track:"AOS1",   arr:42, dep:43 },
    { sid:"sch",       name:"Schleswig",          track:"ASW1",   arr:52, dep:53 },
    { sid:"jue",       name:"Jübek",              track:"AJ2",    arr:60, dep:61 },
    { sid:"hus",       name:"Husum",              track:"AHM1",   arr:85 },
  ]},
  { id:"re74_hk", line:"RE74", name:"RE74", dir:"Kiel Hbf", base:40, minHour:13, stops:[
    { sid:"hus",       name:"Husum",              track:"AHM1",   dep:0 },
    { sid:"jue",       name:"Jübek",              track:"AJ1",    arr:23, dep:24 },
    { sid:"sch",       name:"Schleswig",          track:"ASW3",   arr:32, dep:33 },
    { sid:"ows",       name:"Owschlag",           track:"AOS3",   arr:42, dep:43 },
    { sid:"rbs",       name:"Rendsburg",          track:"AR1",    arr:52, dep:53 },
    { sid:"aon175",    name:"Osterrönfeld (175)", track:"AON175", arr:60, dep:60, passenger:false },
    { sid:"bredenbek", name:"Bredenbek",          track:"",       arr:68, dep:68, passenger:false },
    { sid:"afeb",      name:"Felde-Brandsbek",    track:"AFEB1",  arr:72, dep:75 },
    { sid:"kh",        name:"Kiel-Hassee",        track:"AKH2",   arr:83, dep:83, passenger:false },
    { sid:"kiel",      name:"Kiel Hbf",          track:"AK6a",   arr:87 },
  ]},
];

// ─── STATIONEN ───────────────────────────────────────────────────────────────
const STATIONS = [
  { id:"kiel", name:"Kiel Hbf" }, { id:"kh", name:"Kiel-Hassee CITTI-Park" },
  { id:"kron", name:"Kronshagen" }, { id:"such", name:"Suchsdorf" },
  { id:"krussee", name:"Kiel-Russee" }, { id:"melsdorf", name:"Melsdorf" },
  { id:"achterwehr", name:"Achterwehr" }, { id:"afeb", name:"Felde-Brandsbek" },
  { id:"flintbek", name:"Flintbek" }, { id:"gtf", name:"Gettorf" },
  { id:"eck", name:"Eckernförde" }, { id:"abrd", name:"Bordesholm" },
  { id:"einfeld", name:"Einfeld" }, { id:"nms", name:"Neumünster" },
  { id:"nor", name:"Nortorf" }, { id:"schuelldorf", name:"Schülldorf" },
  { id:"bredenbek", name:"Bredenbek" }, { id:"rbs", name:"Rendsburg" },
  { id:"ows", name:"Owschlag" }, { id:"sch", name:"Schleswig" },
  { id:"jue", name:"Jübek" }, { id:"tarp", name:"Tarp" },
  { id:"fl", name:"Flensburg" }, { id:"husby", name:"Husby" },
  { id:"soe", name:"Sörup" }, { id:"sue", name:"Süderbrarup" },
  { id:"rieseby", name:"Rieseby" }, { id:"hus", name:"Husum" },
];
// Nur Stationen mit mind. einem Personenhalt in den SVCS zeigen
const _PSIDS = new Set(SVCS.flatMap(s => s.stops.filter(st => st.passenger !== false).map(st => st.sid)));
const PUBLIC_STATIONS = STATIONS.filter(s => _PSIDS.has(s.id));

const REASONS = ["Kreuzungswarten","Technische Störung","Verspäteter Anschluss","Streckensperrung","Rangierfahrt","Sonstiges"];

// ─── STYLES ──────────────────────────────────────────────────────────────────
const SEL = { background:"#1e2233", color:"#d8dce8", border:"1px solid #2d3145", borderRadius:4, padding:"5px 8px", fontSize:12, width:"100%", boxSizing:"border-box" };
const TH  = { padding:"5px 8px", textAlign:"center", color:"#a0a5b5", fontWeight:500, whiteSpace:"nowrap", fontSize:11 };

// ─── KLEINE KOMPONENTEN ──────────────────────────────────────────────────────
function Badge({ line }) {
  const c = LC[line] ?? { bg:"#2a2e3f", fg:"#9ba0b0", bd:"#3a3e4f" };
  return <span style={{ background:c.bg, color:c.fg, border:`1px solid ${c.bd}`, borderRadius:3, padding:"2px 7px", fontSize:11, fontWeight:700, fontFamily:"monospace", whiteSpace:"nowrap" }}>{line}</span>;
}
function Btn({ onClick, color="#7eb8f7", children, disabled, small }) {
  return <button onClick={onClick} disabled={disabled} style={{ background:`${color}20`, color, border:`1px solid ${color}55`, borderRadius:4, padding: small ? "4px 10px" : "7px 16px", cursor:disabled?"not-allowed":"pointer", fontSize: small ? 11 : 12, fontWeight:500, opacity:disabled?0.45:1 }}>{children}</button>;
}
const Lbl = ({ children }) => <div style={{ fontSize:10, color:"#a0a5b5", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.08em" }}>{children}</div>;
const SecTitle = ({ children }) => <div style={{ fontSize:10, color:"#a0a5b5", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10, paddingBottom:6, borderBottom:"1px solid #2d3145" }}>{children}</div>;
const Empty = ({ children }) => <div style={{ color:"#7a7e8a", padding:"24px 0", textAlign:"center", fontStyle:"italic" }}>{children}</div>;

// ─── FAHRPLAN-MODAL (NUR PERSONENHALTE) ──────────────────────────────────────
function TripDetail({ svc, h, delays, curMins, onClose }) {
  const c    = LC[svc.line] ?? { fg:"#9ba0b0", bd:"#3a3e4f" };
  const meta = tripMeta(svc, h, delays);
  // Nur Personenhalte anzeigen (passenger !== false)
  const pasStops = svc.stops
    .map((s, si) => ({ ...s, _si: si }))
    .filter(s => s.passenger !== false);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 }} onClick={onClose}>
      <div style={{ background:"#1d2030", border:`1px solid ${c.bd}`, borderRadius:10, width:"100%", maxWidth:480, maxHeight:"88vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:"12px 16px", borderBottom:"1px solid #2d3145", display:"flex", alignItems:"center", gap:10 }}>
          <Badge line={svc.line} />
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, color:"#fff", fontSize:14 }}>→ {svc.dir}</div>
            <div style={{ fontSize:11, color:"#a0a5b5", fontFamily:"monospace" }}>Umlauf {pad2(h)}:{pad2(svc.base)} · ab {svc.stops.find(s=>s.passenger!==false)?.name}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#7a7e8a", cursor:"pointer", fontSize:22, lineHeight:1, padding:"0 4px" }}>✕</button>
        </div>

        {/* Extra-Halte (Zusatzhalte) oben anzeigen wenn vorhanden */}
        {meta.extraStops.length > 0 && (
          <div style={{ padding:"8px 16px", background:"rgba(126,184,247,0.06)", borderBottom:"1px solid #2d3145" }}>
            {meta.extraStops.map((xs, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"3px 0", fontSize:12, fontFamily:"monospace" }}>
                <span style={{ fontSize:10, color:"#7eb8f7", border:"1px solid #2a5aae", borderRadius:2, padding:"0 4px" }}>ZUSATZ</span>
                <span style={{ color:"#d8dce8" }}>{xs.name}</span>
                {xs.track && <span style={{ color:"#7a7e8a", fontSize:10 }}>Gl.{xs.track}</span>}
                {xs.depTime && <span style={{ color:"#7ecf7e", marginLeft:"auto" }}>Ab {toHHMM(xs.depTime)}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Haltestellen (nur Personenhalte) */}
        <div style={{ padding:"6px 0 4px" }}>
          {pasStops.map((s, idx) => {
            const si         = s._si;
            const isTerminus = s.dep === undefined;
            const isOrigin   = s.arr === undefined;
            const cancelled  = meta.cancelledStops.includes(s.sid);
            const newTrack   = meta.trackChanges[s.sid];
            const { time: depT, delay: depD } = !isTerminus ? effectiveTime(svc, h, si, false, delays) : { time:0, delay:0 };
            const { time: arrT, delay: arrD } = !isOrigin   ? effectiveTime(svc, h, si, true,  delays) : { time:0, delay:0 };
            const refTime = isTerminus ? arrT : depT;
            const isPast  = refTime < curMins - 1;
            const isCurr  = !isPast && refTime - curMins <= 3;
            const tl      = newTrack || trackLabel(s.track);

            return (
              <div key={idx} style={{ display:"flex", alignItems:"stretch", opacity: cancelled ? 0.45 : isPast ? 0.4 : 1 }}>
                {/* Timeline */}
                <div style={{ width:36, display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
                  <div style={{ width: idx===0 ? 0 : 2, background:"#3a4055", flex:"0 0 12px" }} />
                  <div style={{ width:11, height:11, borderRadius:"50%", flexShrink:0, background: cancelled ? "#e05c5c" : isCurr ? c.fg : isPast ? "#2d3145" : "#3a4055", border:`2px solid ${cancelled ? "#e05c5c" : isCurr ? c.fg : "#3a4055"}`, boxShadow: isCurr ? `0 0 8px ${c.fg}88` : "none" }} />
                  <div style={{ width: isTerminus ? 0 : 2, background:"#3a4055", flex:1, minHeight:12 }} />
                </div>
                {/* Stop info */}
                <div style={{ flex:1, padding:`4px 14px 14px 4px` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:600, color: cancelled ? "#e05c5c" : isCurr ? c.fg : "#d8dce8", fontSize:13, textDecoration: cancelled ? "line-through" : "none" }}>{s.name}</span>
                    {tl && <span style={{ fontSize:10, color: newTrack ? "#f5a623" : "#5a5e72", fontFamily:"monospace" }}>Gl.{tl}{newTrack && " ⚠"}</span>}
                    {cancelled && <span style={{ fontSize:10, color:"#e05c5c", fontFamily:"monospace", border:"1px solid #6a2a2a", borderRadius:2, padding:"0 4px" }}>Halt fällt aus</span>}
                    {isCurr && !cancelled && <span style={{ fontSize:10, color:c.fg, fontFamily:"monospace" }}>◀ aktuell</span>}
                  </div>
                  {!cancelled && (
                    <div style={{ display:"flex", gap:16, fontFamily:"monospace", fontSize:12 }}>
                      {!isOrigin   && <span><span style={{ color:"#6a7080", fontSize:10 }}>An </span><span style={{ color: arrD>0 ? "#e8c84a" : "#b0b5c5" }}>{toHHMM(arrT)}</span>{arrD>0 && <span style={{ color:"#e8c84a", fontSize:10 }}> +{arrD}</span>}</span>}
                      {!isTerminus && <span><span style={{ color:"#6a7080", fontSize:10 }}>Ab </span><span style={{ fontWeight:700, color: depD>0 ? "#e8c84a" : "#7ecf7e" }}>{toHHMM(depT)}</span>{depD>0 && <span style={{ color:"#e8c84a", fontSize:10 }}> +{depD}</span>}</span>}
                      {isTerminus  && <span style={{ color:"#6a7080", fontSize:10, fontStyle:"italic" }}>Endstation</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding:"6px 16px 12px", borderTop:"1px solid #2d3145", fontSize:11, color:"#4a4e62", textAlign:"center" }}>Außerhalb tippen zum Schließen</div>
      </div>
    </div>
  );
}

// ─── HAUPTAPP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [realNow, setRealNow]   = useState(new Date());
  const [manMins, setManMins]   = useState(13*60);
  const [useMan, setUseMan]     = useState(false);
  const [manInput, setManInput] = useState("13:00");
  const [station, setStation]   = useState("kiel");
  const [tab, setTab]           = useState("dep");
  const [delays, setDelays]     = useState({});
  const [connFrom, setConnFrom] = useState("kiel");
  const [connTo, setConnTo]     = useState("fl");
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  // Meldeformular-State
  const [rSvc, setRSvc]           = useState("re7_nfl");
  const [rHour, setRHour]         = useState(13);
  const [rMin, setRMin]           = useState(0);
  const [rSid, setRSid]           = useState("");
  const [rReason, setRReason]     = useState("");
  const [rCustom, setRCustom]     = useState("");
  const [rTracks, setRTracks]     = useState({});    // {sid: newTrack}
  const [rCancelled, setRCancelled] = useState([]); // [sid, ...]
  const [rExtraSt, setRExtraSt]   = useState([]);   // [{name,track,depTime}]
  const [rExtraName, setRExtraName] = useState("");
  const [rExtraTrack, setRExtraTrack] = useState("");
  const [rExtraTime, setRExtraTime] = useState("");
  const [saved, setSaved]         = useState(false);

  const curMins = useMan ? manMins : ((realNow.getHours() - 5 + 24) % 24) * 60 + realNow.getMinutes() + realNow.getSeconds() / 60;

  useEffect(() => { const t = setInterval(() => setRealNow(new Date()), 10000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap";
    document.head.appendChild(l); return () => { try { document.head.removeChild(l); } catch {} };
  }, []);

  const loadDelays = useCallback(async () => {
    try {
      const res = await window.storage.list("dl_", true);
      if (!res?.keys?.length) { setDelays({}); setLastSync(new Date()); return; }
      const out = {};
      await Promise.all(res.keys.map(async k => {
        try { const r = await window.storage.get(k, true); if (r) out[k.slice(3)] = JSON.parse(r.value); } catch {}
      }));
      setDelays(out); setLastSync(new Date());
    } catch {}
  }, []);
  useEffect(() => { loadDelays(); const t = setInterval(loadDelays, 20000); return () => clearInterval(t); }, [loadDelays]);

  const applyMan = () => { const [h,m] = manInput.split(":").map(Number); if (!isNaN(h)&&!isNaN(m)) { setManMins(h*60+m); setUseMan(true); } };

  const resetForm = (svc) => {
    setRSid(""); setRMin(0); setRReason(""); setRCustom("");
    setRTracks({}); setRCancelled([]); setRExtraSt([]);
    setRExtraName(""); setRExtraTrack(""); setRExtraTime("");
    const fh = [11,12,13,14,15,16,17,18,19].find(h => validHour(svc ?? SVCS[0], h));
    if (fh !== undefined) setRHour(fh);
  };

  const saveDelay = async () => {
    const hasDelay = rMin > 0 && rSid;
    const hasTracks = Object.keys(rTracks).some(k => rTracks[k]);
    const hasCancels = rCancelled.length > 0;
    const hasExtra = rExtraSt.length > 0;
    if (!hasDelay && !hasTracks && !hasCancels && !hasExtra) return;
    const key = `${rSvc}_h${rHour}`;
    const cleanTracks = Object.fromEntries(Object.entries(rTracks).filter(([,v]) => v));
    const val = {
      min: hasDelay ? rMin : 0,
      sid: hasDelay ? rSid : "",
      reason: rCustom || rReason,
      ts: Date.now(),
      trackChanges: cleanTracks,
      cancelledStops: rCancelled,
      extraStops: rExtraSt,
    };
    try {
      await window.storage.set(`dl_${key}`, JSON.stringify(val), true);
      setDelays(p => ({ ...p, [key]: val }));
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch(e) { console.error(e); }
  };

  const clearDelay = async key => {
    try { await window.storage.delete(`dl_${key}`, true); setDelays(p => { const n={...p}; delete n[key]; return n; }); } catch {}
  };

  const selSvc    = SVCS.find(s => s.id === rSvc);
  const pasStops  = selSvc?.stops.filter(s => s.passenger !== false) ?? [];
  const allStops  = selSvc?.stops ?? [];
  const deps      = getDeps(station, delays);
  const conns     = getConns(connFrom, connTo, delays);
  const delayKeys = Object.keys(delays);

  const toggleCancel = sid => setRCancelled(prev => prev.includes(sid) ? prev.filter(x=>x!==sid) : [...prev, sid]);
  const addExtraStop = () => {
    if (!rExtraName) return;
    const depTime = rExtraTime ? (() => { const [h,m]=rExtraTime.split(":").map(Number); return h*60+m; })() : undefined;
    setRExtraSt(prev => [...prev, { name: rExtraName, track: rExtraTrack, depTime }]);
    setRExtraName(""); setRExtraTrack(""); setRExtraTime("");
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'IBM Plex Sans',system-ui,sans-serif", background:"#12151e", color:"#d0d5e5", minHeight:"100vh", fontSize:13 }}>

      {selectedTrip && <TripDetail svc={selectedTrip.svc} h={selectedTrip.h} delays={delays} curMins={curMins} onClose={() => setSelectedTrip(null)} />}

      {/* HEADER */}
      <div style={{ background:"#1d2030", borderBottom:"1px solid #2d3145", padding:"10px 16px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:10, color:"#6a6e82", fontFamily:"monospace", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:2 }}>Baustellenfahrplan · 05.07.2026</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
              <span style={{ fontSize:28, fontWeight:700, color:"#fff", fontFamily:"monospace", letterSpacing:"0.05em", lineHeight:1 }}>{toHHMM(curMins)}</span>
              {useMan && <span style={{ fontSize:10, color:"#f5a623", fontFamily:"monospace" }}>MANUELL</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center", marginLeft:"auto", flexWrap:"wrap" }}>
            <input value={manInput} onChange={e=>setManInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&applyMan()} placeholder="HH:MM" style={{ ...SEL, width:70, fontFamily:"monospace" }} />
            <Btn onClick={applyMan} color="#7ecf7e">Setzen</Btn>
            {useMan && <Btn onClick={()=>setUseMan(false)} color="#cfa87e">Echtzeit</Btn>}
            <Btn onClick={loadDelays} color="#6a6e82">↻</Btn>
            {delayKeys.length > 0 && <span style={{ background:"#3a1a1a", color:"#e07070", border:"1px solid #6a2a2a", borderRadius:10, padding:"2px 9px", fontSize:11, fontFamily:"monospace" }}>{delayKeys.length} Meldg.</span>}
          </div>
        </div>
        {lastSync && <div style={{ fontSize:10, color:"#6a6e82", fontFamily:"monospace", marginTop:4 }}>Sync: {lastSync.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>}
      </div>

      {/* TABS */}
      <div style={{ background:"#1d2030", borderBottom:"1px solid #2d3145", display:"flex", overflowX:"auto" }}>
        {[["dep","Abfahrten"],["conn","Verbindungen"],["report","FDL-Meldungen"],["status","Zugübersicht"]].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"9px 15px", background:"none", border:"none", borderBottom:`2px solid ${tab===k?"#f5a623":"transparent"}`, color:tab===k?"#fff":"#7a7e8a", cursor:"pointer", fontSize:12, fontWeight:tab===k?600:400, whiteSpace:"nowrap", flexShrink:0 }}>{l}</button>
        ))}
      </div>

      <div style={{ padding:14, maxWidth:860, margin:"0 auto" }}>

        {/* ══ ABFAHRTEN ══ */}
        {tab==="dep" && <>
          <div style={{ marginBottom:12 }}>
            <Lbl>Bahnhof</Lbl>
            <select value={station} onChange={e=>setStation(e.target.value)} style={SEL}>
              {PUBLIC_STATIONS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <SecTitle>Abfahrten 12:00 – 20:00 · Tippen = Fahrplan</SecTitle>
          {deps.length===0 ? <Empty>Keine Abfahrten für diesen Halt im Baustellenbetrieb</Empty>
            : deps.map((d,i) => {
              const isPast  = d.time < curMins - 1;
              const mins    = Math.round(d.time - curMins);
              const isSoon  = !isPast && mins <= 5;
              const lineC   = LC[d.svc.line]?.fg ?? "#7eb8f7";
              const cancelled = d.meta.cancelledStops.includes(d.stop.sid);
              const newTrack  = d.meta.trackChanges[d.stop.sid];
              const tl        = newTrack || trackLabel(d.stop.track);
              return (
                <div key={i} onClick={()=>setSelectedTrip({svc:d.svc,h:d.h})}
                  style={{ background: cancelled ? "rgba(224,92,92,0.07)" : isPast ? "rgba(255,255,255,0.018)" : "#1d2030", border:`1px solid ${cancelled?"#6a2a2a":isSoon?"#f5a623":"#2d3145"}`, borderLeft:`3px solid ${cancelled?"#e05c5c":lineC}`, borderRadius:6, padding:"9px 12px", display:"flex", alignItems:"center", gap:10, marginBottom:5, opacity: isPast?0.42:1, cursor:"pointer" }}
                  onMouseEnter={e=>{ if(!isPast) e.currentTarget.style.background=cancelled?"rgba(224,92,92,0.1)":"#232638"; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background=cancelled?"rgba(224,92,92,0.07)":isPast?"rgba(255,255,255,0.018)":"#1d2030"; }}
                >
                  <Badge line={d.svc.line} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, color: cancelled?"#e05c5c":"#e8eaf0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textDecoration: cancelled?"line-through":"none" }}>→ {d.svc.dir}</div>
                    <div style={{ fontSize:10, fontFamily:"monospace", color: newTrack?"#f5a623":"#a0a5b5" }}>
                      {cancelled ? "Halt fällt aus" : tl ? `Gl. ${tl}${newTrack?" (geändert)":""}` : ""}
                    </div>
                  </div>
                  {!cancelled && (
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontFamily:"monospace", fontSize:17, fontWeight:700, color:d.delay>0?"#e8c84a":"#7ecf7e", lineHeight:1 }}>
                        {toHHMM(d.time)}{d.delay>0&&<span style={{ fontSize:11, marginLeft:5 }}>(+{d.delay})</span>}
                      </div>
                      <div style={{ fontSize:11, fontFamily:"monospace", color: isPast?"#4a4e60":isSoon?"#f5a623":"#a0a5b5", marginTop:1 }}>
                        {isPast?"abgefahren":mins<=0?"jetzt":`in ${mins} min`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </>}

        {/* ══ VERBINDUNGEN ══ */}
        {tab==="conn" && <>
          <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"flex-end", flexWrap:"wrap" }}>
            <div style={{ flex:1, minWidth:130 }}><Lbl>Von</Lbl><select value={connFrom} onChange={e=>setConnFrom(e.target.value)} style={SEL}>{PUBLIC_STATIONS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <button onClick={()=>{setConnFrom(connTo);setConnTo(connFrom);}} style={{ background:"#2d3145", color:"#a0a5b5", border:"1px solid #3d4155", borderRadius:4, padding:"5px 10px", cursor:"pointer", flexShrink:0 }}>⇄</button>
            <div style={{ flex:1, minWidth:130 }}><Lbl>Nach</Lbl><select value={connTo} onChange={e=>setConnTo(e.target.value)} style={SEL}>{PUBLIC_STATIONS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <SecTitle>Direktverbindungen 12:00 – 20:00 · Tippen = Fahrplan</SecTitle>
          {conns.length===0 ? <Empty>Keine Direktverbindung – ggf. Umstieg nötig</Empty>
            : conns.map((c,i) => {
              const isPast = c.dep < curMins - 1;
              const mins   = Math.round(c.dep - curMins);
              const lineC  = LC[c.svc.line]?.fg ?? "#7eb8f7";
              return (
                <div key={i} onClick={()=>setSelectedTrip({svc:c.svc,h:c.h})}
                  style={{ background:"#1d2030", border:"1px solid #2d3145", borderLeft:`3px solid ${lineC}`, borderRadius:6, padding:"10px 14px", marginBottom:7, opacity:isPast?0.42:1, cursor:"pointer" }}
                  onMouseEnter={e=>{ if(!isPast) e.currentTarget.style.background="#232638"; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background="#1d2030"; }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                    <Badge line={c.svc.line} />
                    <span style={{ fontWeight:600, color:"#e8eaf0" }}>→ {c.svc.dir}</span>
                    <span style={{ marginLeft:"auto", fontSize:11, color:"#a0a5b5", fontFamily:"monospace" }}>{c.dur} min</span>
                    <span style={{ fontSize:10, color:"#4a4e62" }}>Fahrplan →</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"monospace", fontSize:13 }}>
                    <div>
                      <span style={{ color:"#a0a5b5", fontSize:11 }}>Ab </span>
                      <span style={{ fontWeight:700, color:c.dd>0?"#e8c84a":"#7ecf7e" }}>{toHHMM(c.dep)}</span>
                      {c.dd>0&&<span style={{ color:"#e8c84a", fontSize:10, marginLeft:3 }}>(+{c.dd})</span>}
                      <span style={{ color:isPast?"#4a4e60":"#a0a5b5", fontSize:11, marginLeft:8 }}>{isPast?"abg.":mins<=0?"jetzt":`in ${mins} min`}</span>
                    </div>
                    <div>
                      <span style={{ color:"#a0a5b5", fontSize:11 }}>An </span>
                      <span style={{ fontWeight:700, color:c.ad>0?"#e8c84a":"#7ecf7e" }}>{toHHMM(c.arr)}</span>
                      {c.ad>0&&<span style={{ color:"#e8c84a", fontSize:10, marginLeft:3 }}>(+{c.ad})</span>}
                    </div>
                  </div>
                </div>
              );
            })}
        </>}

        {/* ══ FDL-MELDUNGEN ══ */}
        {tab==="report" && <>
          <div style={{ background:"#1d2030", border:"1px solid #2d3145", borderRadius:6, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#f5a623", marginBottom:14 }}>Betriebliche Meldung erfassen</div>

            {/* Zug-Auswahl */}
            <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              <div style={{ flex:2, minWidth:160 }}>
                <Lbl>Linie / Richtung</Lbl>
                <select value={rSvc} onChange={e => { const ns=SVCS.find(s=>s.id===e.target.value); setRSvc(e.target.value); resetForm(ns); }} style={SEL}>
                  {SVCS.map(s=><option key={s.id} value={s.id}>{s.line} → {s.dir} (:{pad2(s.base)})</option>)}
                </select>
              </div>
              <div style={{ flex:1, minWidth:120 }}>
                <Lbl>Umlauf</Lbl>
                <select value={rHour} onChange={e=>setRHour(+e.target.value)} style={SEL}>
                  {[11,12,13,14,15,16,17,18,19].filter(h=>validHour(selSvc??SVCS[0],h)).map(h=>(
                    <option key={h} value={h}>{pad2(h)}:{pad2(selSvc?.base??0)} ab {selSvc?.stops.find(s=>s.passenger!==false)?.name??""}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ─ VERSPÄTUNG ─ */}
            <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:5, padding:"10px 12px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#e8c84a", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.07em" }}>Verspätung</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <div style={{ flex:"0 0 90px" }}>
                  <Lbl>Minuten</Lbl>
                  <input type="number" min={0} max={90} value={rMin} onChange={e=>setRMin(+e.target.value)} style={{ ...SEL, width:"100%" }} />
                </div>
                <div style={{ flex:1, minWidth:140 }}>
                  <Lbl>Festgestellt an (inkl. Betrieb)</Lbl>
                  <select value={rSid} onChange={e=>setRSid(e.target.value)} style={SEL}>
                    <option value="">— Halt wählen —</option>
                    {allStops.map((s,i)=>(
                      <option key={i} value={s.sid}>{s.passenger===false ? `⚙ ${s.name}` : s.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex:1, minWidth:140 }}>
                  <Lbl>Grund</Lbl>
                  <select value={rReason} onChange={e=>{setRReason(e.target.value);setRCustom("");}} style={SEL}>
                    <option value="">—</option>
                    {REASONS.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {rReason==="Sonstiges" && <input value={rCustom} onChange={e=>setRCustom(e.target.value)} placeholder="Eigener Grund..." style={{ ...SEL, marginTop:6 }} />}
            </div>

            {/* ─ GLEISÄNDERUNGEN ─ */}
            <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:5, padding:"10px 12px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#f5a623", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.07em" }}>Gleisänderungen</div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {pasStops.map((s,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ flex:1, color:"#c0c5d5", fontSize:12 }}>{s.name}</span>
                    <span style={{ fontSize:11, color:"#5a5e72", fontFamily:"monospace", width:40 }}>{trackLabel(s.track) ? `Gl.${trackLabel(s.track)}` : "—"}</span>
                    <span style={{ fontSize:11, color:"#6a6e82" }}>→</span>
                    <input
                      value={rTracks[s.sid] ?? ""}
                      onChange={e => setRTracks(p=>({...p,[s.sid]:e.target.value}))}
                      placeholder="neues Gleis"
                      style={{ ...SEL, width:90, padding:"3px 6px" }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ─ HALTEAUSFALL ─ */}
            <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:5, padding:"10px 12px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#e05c5c", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.07em" }}>Halteausfälle</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {pasStops.map((s,i) => {
                  const on = rCancelled.includes(s.sid);
                  return (
                    <button key={i} onClick={()=>toggleCancel(s.sid)} style={{ background: on?"rgba(224,92,92,0.2)":"rgba(255,255,255,0.04)", color: on?"#e05c5c":"#9ba0b0", border:`1px solid ${on?"#6a2a2a":"#3d4155"}`, borderRadius:4, padding:"4px 10px", cursor:"pointer", fontSize:11 }}>
                      {on ? "✕ " : ""}{s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─ ZUSATZHALTE ─ */}
            <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:5, padding:"10px 12px", marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#7eb8f7", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.07em" }}>Zusatzhalte</div>
              {rExtraSt.length > 0 && (
                <div style={{ marginBottom:8 }}>
                  {rExtraSt.map((xs,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"3px 0", fontSize:12, fontFamily:"monospace" }}>
                      <span style={{ color:"#7eb8f7" }}>+</span>
                      <span style={{ flex:1, color:"#d0d5e5" }}>{xs.name}</span>
                      {xs.track && <span style={{ color:"#a0a5b5" }}>Gl.{xs.track}</span>}
                      {xs.depTime && <span style={{ color:"#7ecf7e" }}>Ab {toHHMM(xs.depTime)}</span>}
                      <button onClick={()=>setRExtraSt(p=>p.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", color:"#e05c5c", cursor:"pointer", fontSize:14 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                <input value={rExtraName} onChange={e=>setRExtraName(e.target.value)} placeholder="Haltestelle" style={{ ...SEL, flex:2, minWidth:120 }} />
                <input value={rExtraTrack} onChange={e=>setRExtraTrack(e.target.value)} placeholder="Gleis" style={{ ...SEL, width:70 }} />
                <input value={rExtraTime} onChange={e=>setRExtraTime(e.target.value)} placeholder="HH:MM" style={{ ...SEL, width:70 }} />
                <Btn onClick={addExtraStop} color="#7eb8f7" small disabled={!rExtraName}>+ Hinzufügen</Btn>
              </div>
            </div>

            <Btn onClick={saveDelay} color={saved?"#7ecf7e":"#7eb8f7"} disabled={rMin<=0&&!Object.values(rTracks).some(v=>v)&&rCancelled.length===0&&rExtraSt.length===0}>
              {saved ? "✓  Gespeichert & geteilt!" : "⬆  Meldung absetzen & teilen"}
            </Btn>
          </div>

          {/* Aktive Meldungen */}
          {delayKeys.length > 0 && <>
            <SecTitle>Aktive Meldungen (alle FDL)</SecTitle>
            {delayKeys.map(key => {
              const svcId = key.replace(/_h\d+$/,"");
              const hour  = parseInt(key.match(/_h(\d+)$/)?.[1]??0);
              const svc   = SVCS.find(s=>s.id===svcId);
              const d     = delays[key];
              const repStop = svc?.stops.find(s=>s.sid===d.sid);
              const isOp    = repStop?.passenger===false;
              const cleanTC = Object.entries(d.trackChanges??{}).filter(([,v])=>v);
              return (
                <div key={key} style={{ background:"#1d2030", border:"1px solid #3d3020", borderRadius:6, padding:"9px 12px", marginBottom:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: (d.min||cleanTC.length||d.cancelledStops?.length||d.extraStops?.length) ? 6 : 0 }}>
                    {svc && <Badge line={svc.line} />}
                    <span style={{ color:"#b0b5c5", fontFamily:"monospace", fontSize:12 }}>{pad2(hour)}:{pad2(svc?.base??0)}</span>
                    <button onClick={()=>clearDelay(key)} style={{ background:"none", border:"none", color:"#e05c5c", cursor:"pointer", fontSize:18, lineHeight:1, padding:"0 4px", marginLeft:"auto" }}>×</button>
                  </div>
                  {d.min > 0 && <div style={{ fontSize:12, fontFamily:"monospace", color:"#e8c84a", marginBottom:3 }}>
                    <span style={{ fontWeight:700 }}>+{d.min} min</span>
                    {repStop && <span style={{ color:"#8a8e9a", marginLeft:6 }}>festgest. bei {repStop.name}{isOp?" (Betrieb)":""}</span>}
                    {d.reason && <span style={{ color:"#6a6e82", fontStyle:"italic", marginLeft:6 }}>({d.reason})</span>}
                  </div>}
                  {cleanTC.length > 0 && <div style={{ fontSize:11, fontFamily:"monospace", color:"#f5a623" }}>
                    {cleanTC.map(([sid,t])=>{const sn=svc?.stops.find(s=>s.sid===sid)?.name??sid; return `${sn} → Gl.${t}`;}).join(" · ")}
                  </div>}
                  {(d.cancelledStops?.length??0) > 0 && <div style={{ fontSize:11, fontFamily:"monospace", color:"#e05c5c" }}>
                    Ausfall: {d.cancelledStops.map(sid=>svc?.stops.find(s=>s.sid===sid)?.name??sid).join(", ")}
                  </div>}
                  {(d.extraStops?.length??0) > 0 && <div style={{ fontSize:11, fontFamily:"monospace", color:"#7eb8f7" }}>
                    Zusatzhalt: {d.extraStops.map(xs=>xs.name).join(", ")}
                  </div>}
                </div>
              );
            })}
          </>}
        </>}

        {/* ══ ZUGÜBERSICHT ══ */}
        {tab==="status" && <>
          <SecTitle>Zugübersicht 12:00 – 20:00 · Zeile tippen = Fahrplan</SecTitle>
          {SVCS.map(svc => {
            const pStops = svc.stops.filter(s=>s.passenger!==false);
            const trips  = [12,13,14,15,16,17,18,19].filter(h => {
              const t = h*60+svc.base;
              return validHour(svc,h) && t>=SHOW_FROM*60 && t<=SHOW_TO*60;
            });
            if (!trips.length) return null;
            return (
              <div key={svc.id} style={{ background:"#1d2030", border:"1px solid #2d3145", borderRadius:6, marginBottom:10, overflow:"hidden" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"rgba(255,255,255,0.03)", borderBottom:"1px solid #2d3145" }}>
                  <Badge line={svc.line} />
                  <span style={{ fontWeight:600, color:"#e8eaf0" }}>→ {svc.dir}</span>
                  <span style={{ marginLeft:"auto", fontSize:11, color:"#a0a5b5", fontFamily:"monospace" }}>
                    {svc.maxHour!==undefined ? `einmalig ${pad2(svc.minHour??0)}:${pad2(svc.base)}` : `stündlich :${pad2(svc.base)}`}
                  </span>
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ borderCollapse:"collapse", fontSize:11, fontFamily:"monospace", width:"100%", minWidth:400 }}>
                    <thead>
                      <tr style={{ borderBottom:"1px solid #2d3145", background:"rgba(0,0,0,0.2)" }}>
                        <th style={{ ...TH, textAlign:"left", paddingLeft:12 }}>Umlauf</th>
                        {pStops.map((s,i)=>(
                          <th key={i} style={TH}>{s.name.split(" ")[0]}<div style={{ fontSize:9, color:"#5a5e72", fontWeight:400 }}>{trackLabel(s.track)?`Gl.${trackLabel(s.track)}`:""}</div></th>
                        ))}
                        <th style={{ ...TH, textAlign:"right", paddingRight:12 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trips.map(h => {
                        const key  = `${svc.id}_h${h}`;
                        const meta = tripMeta(svc, h, delays);
                        const hasAny = meta.delay>0||Object.values(meta.trackChanges).some(v=>v)||meta.cancelledStops.length>0||meta.extraStops.length>0;
                        return (
                          <tr key={h} onClick={()=>setSelectedTrip({svc,h})} style={{ borderBottom:"1px solid #1a1d2a", cursor:"pointer" }}
                            onMouseEnter={e=>e.currentTarget.style.background="#272a3d"}
                            onMouseLeave={e=>e.currentTarget.style.background=""}
                          >
                            <td style={{ padding:"6px 12px", color:"#b0b5c5", fontWeight:600 }}>{pad2(h)}:{pad2(svc.base)}</td>
                            {pStops.map((s,si)=>{
                              const fullSi = svc.stops.findIndex(st=>st===s);
                              const isArr  = s.dep===undefined;
                              const {time:t, delay:dly} = effectiveTime(svc,h,fullSi,isArr,delays);
                              const past = t < curMins-1;
                              const canc = meta.cancelledStops.includes(s.sid);
                              const nTrk = meta.trackChanges[s.sid];
                              return (
                                <td key={si} style={{ padding:"6px 8px", textAlign:"center", color: canc?"#e05c5c":dly>0?"#e8c84a":past?"#5a5e72":"#c8dcc8", textDecoration:canc?"line-through":"none" }}>
                                  {toHHMM(t)}{dly>0&&<sup style={{ fontSize:8 }}>+{dly}</sup>}
                                  {nTrk&&<div style={{ fontSize:9, color:"#f5a623" }}>Gl.{nTrk}</div>}
                                </td>
                              );
                            })}
                            <td style={{ padding:"6px 12px", textAlign:"right" }}>
                              {hasAny
                                ? <span style={{ color: meta.cancelledStops.length>0?"#e05c5c":"#e8c84a", fontWeight:600 }}>
                                    {meta.cancelledStops.length>0?"Ausfall":meta.delay>0?`+${meta.delay} min`:"Änd."}
                                  </span>
                                : <span style={{ color:"#4caf82" }}>✓</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>}
      </div>
    </div>
  );
}
