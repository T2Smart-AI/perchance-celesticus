// satellites.js — live artificial satellites (SGP4) for Celestia Web.
//
// Technique adapted from satvis (Flowm/satvis: Cesium + satellite.js, SGP4 in
// the browser from CelesTrak element sets) and godseye's SatelliteLayer
// (satellite.js twoline2satrec + propagate + eciToGeodetic, bundled fallback
// TLE, render budgets). Re-implemented dependency-free for our Three.js scene:
//
//  - satellite.js loaded lazily from esm.sh on first enable (space boot fast)
//  - TLEs from CelesTrak GP groups (stations + visual), keyless, CORS-open;
//    bundled ISS/HST/CSS fallback when offline (godseye FALLBACK_TLE pattern)
//  - positions via propagate() -> eciToGeodetic -> lat/lon/alt, then placed
//    with the Earth mesh matrix (localToWorld), so tilt + daily spin match
//    the visible Blue Marble texture exactly
//  - one THREE.Points cloud (cap 400) colored by orbit class (satvis-style:
//    LEO/MEO/GEO/HEO), plus an ISS orbit ribbon sampled over one revolution
import * as THREE from "../../vendor/p2ga5t-three_0.160.0.js";

const CELESTRAK = "https://celestrak.org/NORAD/elements/gp.php?GROUP=";
const GROUPS = ["stations", "visual"]; // ~200 sats total, cheap to propagate
const CAP = 400;

const FALLBACK_TLE = `ISS (ZARYA)
1 25544U 98067A   26329.13827949  .00005332  00000+0  10279-3 0  9999
2 25544  51.6318 223.5844 0007439   62.9833 297.1915 15.49581308XXX
CSS (TIANHE)
1 48274U 2021-035A   26320.51791667  .00021845  00000+0  14351-3 0  9992
2 48274  41.4702  33.0908 0002140  92.9184 267.1749 15.60151374XXX
HST
1 20580U 90037B   26320.50000000  .00003290  00000+0  16259-3 0  9991
2 20580  28.4694 207.2185 0002448  91.1354  30.8351 15.00052309XXX`;

let satLib = null, earthRef = null, sceneRef = null;
let sats = [];            // {name, satrec, periodMin, cls}
let points = null, colors = null;
let issLine = null, issLineAt = 0;
let lastUpdate = 0, enabled = true, ready = false, statusMsg = "loading…";
let loadPromise = null;

const CLS_COLOR = {
  LEO: [0.45, 0.75, 1.0],   // low earth — blue
  MEO: [0.55, 1.0, 0.65],   // navigation — green
  GEO: [1.0, 0.85, 0.35],   // geostationary — gold
  HEO: [1.0, 0.55, 0.45],   // highly elliptical — salmon
  STA: [1.0, 1.0, 1.0],     // stations — white
};

function parseTle(text) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("1 ") && lines[i + 1] && lines[i + 1].startsWith("2 ")) {
      out.push({ name: lines[i - 1] && !lines[i - 1].startsWith("1") && !lines[i - 1].startsWith("2") ? lines[i - 1] : `SAT-${out.length + 1}`, l1: lines[i], l2: lines[i + 1] });
      i += 1;
    }
  }
  return out;
}

function classify(periodMin, altKm, inclDeg) {
  if (altKm > 34000 && altKm < 37200 && inclDeg < 15) return "GEO";
  if (periodMin < 128 || altKm < 2000) return "LEO";
  if (altKm > 30000 || periodMin > 600) return "HEO";
  return "MEO";
}

async function ensureLib() {
  if (!satLib) satLib = await import("../../vendor/10ywmr5-satellite.js_5.0.0.js");
  return satLib;
}

async function fetchGroup(g) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(CELESTRAK + g + "&FORMAT=tle", { signal: c.signal });
    if (!r.ok) return [];
    return parseTle(await r.text());
  } catch (e) { return []; }
  finally { clearTimeout(t); }
}

// lat/lon/alt -> Earth-local direction (inverse of streetmap dirToLatLon:
// local -X is lon -180, matching THREE.SphereGeometry UVs of the day texture)
const D2R = Math.PI / 180;
function latLonToLocal(lat, lon, r, out) {
  const theta = (90 - lat) * D2R;
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const sx = Math.sin(theta);
  return out.set(-sx * Math.cos(phi) * r, Math.cos(theta) * r, sx * Math.sin(phi) * r);
}

export function initSatellites(earth, scene) {
  earthRef = earth; sceneRef = scene;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(CAP * 3), 3));
  colors = new Float32Array(CAP * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setDrawRange(0, 0);
  points = new THREE.Points(g, new THREE.PointsMaterial({
    size: 3.2, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.95, depthWrite: false,
  }));
  points.frustumCulled = false;
  scene.add(points);
  // ISS orbit ribbon
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(91 * 3), 3));
  issLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
  issLine.frustumCulled = false;
  scene.add(issLine);
  loadPromise = load();
  return loadPromise;
}

async function load() {
  try { await ensureLib(); }
  catch (e) { statusMsg = "sat lib failed"; return; }
  let recs = [];
  try {
    const groups = await Promise.all(GROUPS.map(fetchGroup));
    recs = groups.flat();
  } catch (e) { /* offline */ }
  if (!recs.length) recs = parseTle(FALLBACK_TLE);
  recs = recs.slice(0, CAP);
  const tmp = [];
  for (const r of recs) {
    try {
      const satrec = satLib.twoline2satrec(r.l1, r.l2);
      if (!satrec || !satrec.satnum) continue;
      const periodMin = 2 * Math.PI / satrec.no; // rad/min -> min
      tmp.push({ name: r.name, satrec, periodMin });
    } catch (e) { /* skip bad rows */ }
  }
  sats = tmp;
  // color by orbit class from a first fix
  const now = new Date();
  const pos = new THREE.Vector3();
  sats.forEach((s, i) => {
    let alt = 400, incl = 50;
    try {
      const pv = satLib.propagate(s.satrec, now);
      if (pv && pv.position) {
        const gd = satLib.eciToGeodetic(pv.position, satLib.gstime(now));
        alt = gd.height; incl = s.satrec.inclo * 57.2958;
      }
    } catch (e) { /* keep defaults */ }
    s.cls = /ISS|CSS|TIANHE|STATION|TIANGONG/i.test(s.name) ? "STA" : classify(s.periodMin, alt, incl);
    if (i === 0 && /ISS/i.test(s.name)) s.cls = "STA";
    const c = CLS_COLOR[s.cls] || CLS_COLOR.LEO;
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  });
  // stations first so ISS/CSS stay index-stable, then alphabetical
  sats.sort((a, b) => ((b.cls === "STA") - (a.cls === "STA")) || a.name.localeCompare(b.name));
  points.geometry.attributes.color.needsUpdate = true;
  points.geometry.setDrawRange(0, sats.length);
  ready = sats.length > 0;
  statusMsg = ready ? `${sats.length} sats` : "no data";
}

const _local = new THREE.Vector3();
export function updateSatellites(jd) {
  if (!ready || !enabled || !earthRef) return;
  const nowMs = performance.now();
  if (nowMs - lastUpdate < 1000) return; // 1 Hz is plenty (satvis replays at 1 Hz too)
  lastUpdate = nowMs;
  const date = new Date((jd - 2440587.5) * 86400000);
  const gmst = satLib.gstime(date);
  const visR = earthRef.visR;
  const arr = points.geometry.attributes.position.array;
  earthRef.mesh.updateWorldMatrix(true, false);
  let iss = null;
  for (let i = 0; i < sats.length; i++) {
    const s = sats[i];
    try {
      const pv = satLib.propagate(s.satrec, date);
      if (!pv || !pv.position) continue;
      const gd = satLib.eciToGeodetic(pv.position, gmst);
      const lat = gd.latitude * 57.2958, lon = gd.longitude * 57.2958;
      const r = visR * (1 + Math.max(0, gd.height) / 6371);
      latLonToLocal(lat, lon, r, _local);
      earthRef.mesh.localToWorld(_local);
      arr[i * 3] = _local.x; arr[i * 3 + 1] = _local.y; arr[i * 3 + 2] = _local.z;
      if (!iss && s.cls === "STA" && /ISS/i.test(s.name)) iss = s;
    } catch (e) { /* keep last fix */ }
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.visible = enabled;
  // ISS ribbon: sample one full period every 30 s
  const target = iss || sats[0];
  if (target && nowMs - issLineAt > 30000) {
    issLineAt = nowMs;
    const la = issLine.geometry.attributes.position.array;
    const mins = target.periodMin || 92;
    earthRef.mesh.updateWorldMatrix(true, false);
    for (let k = 0; k <= 90; k++) {
      const d = new Date(date.getTime() + ((k / 90) - 0.5) * mins * 60000);
      try {
        const pv = satLib.propagate(target.satrec, d);
        const gd = satLib.eciToGeodetic(pv.position, satLib.gstime(d));
        latLonToLocal(gd.latitude * 57.2958, gd.longitude * 57.2958,
          visR * (1 + Math.max(0, gd.height) / 6371), _local);
        earthRef.mesh.localToWorld(_local);
        la[k * 3] = _local.x; la[k * 3 + 1] = _local.y; la[k * 3 + 2] = _local.z;
      } catch (e) { /* noop */ }
    }
    issLine.geometry.attributes.position.needsUpdate = true;
  }
  issLine.visible = enabled && !!target;
}

export function setSatsVisible(v) {
  enabled = v;
  if (points) points.visible = v;
  if (issLine) issLine.visible = v;
}
export function satsStatus() { return statusMsg; }
export function satCount() { return sats.length; }
export function issLatLon(jd) {
  // current ISS subpoint for the info panel / street-map handoff
  const s = sats.find((x) => /ISS/i.test(x.name)) || sats[0];
  if (!s || !satLib) return null;
  try {
    const date = new Date((jd - 2440587.5) * 86400000);
    const pv = satLib.propagate(s.satrec, date);
    const gd = satLib.eciToGeodetic(pv.position, satLib.gstime(date));
    return { name: s.name, lat: gd.latitude * 57.2958, lon: gd.longitude * 57.2958, altKm: gd.height };
  } catch (e) { return null; }
}
