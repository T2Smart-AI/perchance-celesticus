// events.js — live Earth event overlays for Celestia Web.
//
// Keyless, CORS-open feeds only (endpoint catalog inspired by godseye's
// dataSources.js, which documents the same URLs; we use just the two that
// work without proxies or keys):
//  - USGS earthquakes 2.5+/day GeoJSON  (point markers, size/color by mag)
//  - NASA EONET open events             (storms/wildfires/volcanoes/ice)
// Markers ride as children of the Earth mesh so tilt + spin carry them,
// exactly like the day texture. 6 h in-memory cache; lazy fetch on enable.
import * as THREE from "../../vendor/p2ga5t-three_0.160.0.js";

const USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";
const EONET = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=300";

let earthRef = null, group = null, enabled = true;
let cacheAt = 0, loading = null, statusMsg = "loading…";
let quakePts = null, eonetPts = null;
const TTL = 6 * 3600 * 1000;
const D2R = Math.PI / 180;

function latLonToLocal(lat, lon, r, out) {
  const theta = (90 - lat) * D2R;
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const sx = Math.sin(theta);
  return out.set(-sx * Math.cos(phi) * r, Math.cos(theta) * r, sx * Math.sin(phi) * r);
}

const CAT_COLOR = { // EONET category -> color
  SevereStorms: [1, 0.45, 0.3], Wildfires: [1, 0.55, 0.1], Volcanoes: [1, 0.25, 0.2],
  SeaLakeIce: [0.6, 0.85, 1], Floods: [0.35, 0.6, 1], Drought: [1, 0.85, 0.4],
  Earthquakes: [1, 0.4, 0.6], Landslides: [0.8, 0.6, 0.4], Snow: [0.9, 0.95, 1],
  TemperatureExtremes: [1, 0.7, 0.7], WaterColor: [0.4, 1, 0.8],
};

function mkPoints(n, size, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 3), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 3), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    size, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity, depthWrite: false,
  }));
  p.frustumCulled = false;
  return p;
}

export function initEvents(earth) {
  earthRef = earth;
  group = new THREE.Group();
  earth.mesh.add(group); // rides tilt + spin with the texture
  group.visible = enabled;
  loading = refresh();
  return loading;
}

async function fetchJson(url, timeoutMs = 15000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

async function refresh() {
  const [usgs, eonet] = await Promise.all([fetchJson(USGS), fetchJson(EONET)]);
  const visR = earthRef.visR, v = new THREE.Vector3();
  let nq = 0, ne = 0;
  if (usgs && usgs.features) {
    const feats = usgs.features.filter((f) => f.geometry && f.geometry.coordinates).slice(0, 300);
    if (quakePts) { group.remove(quakePts); quakePts.geometry.dispose(); }
    quakePts = mkPoints(feats.length, 4.2, 0.95);
    const pa = quakePts.geometry.attributes.position.array, ca = quakePts.geometry.attributes.color.array;
    feats.forEach((f, i) => {
      const [lon, lat] = f.geometry.coordinates;
      const mag = f.properties && f.properties.mag ? f.properties.mag : 2.5;
      latLonToLocal(lat, lon, visR * 1.008, v);
      pa.set([v.x, v.y, v.z], i * 3);
      // yellow -> red with magnitude
      const t = Math.min(1, (mag - 2.5) / 4);
      ca.set([1, 0.85 - t * 0.6, 0.25 - t * 0.15], i * 3);
      nq++;
    });
    quakePts.geometry.attributes.position.needsUpdate = true;
    quakePts.geometry.setDrawRange(0, nq);
    group.add(quakePts);
  }
  if (eonet && eonet.events) {
    const evs = [];
    for (const e of eonet.events) {
      const g = e.geometry && e.geometry.length ? e.geometry[e.geometry.length - 1] : null;
      const coords = g && g.coordinates;
      if (!coords) continue;
      // EONET geometries: Point [lon,lat] or Polygon — take first ring centroid-ish
      let lon, lat;
      if (g.type === "Point") [lon, lat] = coords;
      else if (Array.isArray(coords[0])) {
        const ring = Array.isArray(coords[0][0]) ? coords[0][0] : coords[0];
        lon = ring[0]; lat = ring[1];
      } else continue;
      if (!isFinite(lat) || !isFinite(lon)) continue;
      evs.push({ lat, lon, cat: (e.categories && e.categories[0] && e.categories[0].id) || "Other" });
      if (evs.length >= 300) break;
    }
    if (eonetPts) { group.remove(eonetPts); eonetPts.geometry.dispose(); }
    eonetPts = mkPoints(evs.length, 3.4, 0.9);
    const pa = eonetPts.geometry.attributes.position.array, ca = eonetPts.geometry.attributes.color.array;
    evs.forEach((e, i) => {
      latLonToLocal(e.lat, e.lon, visR * 1.01, v);
      pa.set([v.x, v.y, v.z], i * 3);
      ca.set(CAT_COLOR[e.cat] || [1, 0.6, 0.9], i * 3);
      ne++;
    });
    eonetPts.geometry.attributes.position.needsUpdate = true;
    eonetPts.geometry.setDrawRange(0, ne);
    group.add(eonetPts);
  }
  cacheAt = performance.now();
  statusMsg = `${nq} quakes · ${ne} hazards`;
  loading = null;
}

export function updateEvents() {
  if (!earthRef) return;
  if (!loading && performance.now() - cacheAt > TTL) loading = refresh();
}

export function setEventsVisible(v) {
  enabled = v;
  if (group) group.visible = v;
  if (v && !loading && performance.now() - cacheAt > TTL) loading = refresh();
}
export function eventsStatus() { return statusMsg; }
