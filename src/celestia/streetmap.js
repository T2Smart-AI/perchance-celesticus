// streetmap.js — ultra-detailed street-level 3D map (MapLibre GL JS +
// OpenFreeMap vector tiles). 100% free, no API key, no signup, lazy-loaded
// on first open so the space boot stays fast.
//
// What you get (OpenFreeMap "liberty" style): 3D-extruded buildings with real
// heights, parks, water, street names/numbers, POIs + free AWS Terrarium
// terrain relief. Drag = pan, wheel = zoom, right-drag = tilt/orbit.
const ML_VERSION = "5.24.1";
const ML_JS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VERSION}/dist/maplibre-gl.js`;
const ML_CSS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VERSION}/dist/maplibre-gl.css`;
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

let map = null, libPromise = null, lastMapError = null, returnArmed = false, returnHandler = null;
let currentProj = "mercator"; // MapLibre default; tracked locally (no reliable getter)
let flying = false; // programmatic/user camera flight in progress: no projection swaps mid-flight

// Called by the host when the user zooms out of the globe (zoom < 2): the
// host fades back to the space view above that lat/lon.
export function setReturnHandler(fn) { returnHandler = fn; }

function armReturn() { returnArmed = true; }

export function streetDebug() {
  if (!map) return { created: false, lastError: lastMapError };
  let style = null;
  try { style = map.getStyle(); } catch (e) { /* noop */ }
  return {
    created: true,
    loaded: map.loaded(),
    zoom: map.getZoom(),
    center: map.getCenter(),
    styleName: style && style.name,
    nSources: style && style.sources ? Object.keys(style.sources).length : 0,
    lastError: lastMapError,
  };
}

const $ = (id) => document.getElementById(id);

function loadLib() {
  if (window.maplibregl) return Promise.resolve();
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = ML_CSS;
    document.head.appendChild(link);
    const s = document.createElement("script");
    s.src = ML_JS;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("MapLibre CDN load failed"));
    document.head.appendChild(s);
  });
  return libPromise;
}

export function isStreetOpen() {
  const ov = $("streetOv");
  return !!(ov && !ov.hidden);
}

function setStatus(msg, isErr) {
  const el = $("streetStatus");
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = msg;
  el.style.borderColor = isErr ? "#8a3a3a" : "#4d7dd1";
}

function setPlace(label) {
  $("streetPlace").textContent = label ? `· ${label}` : "";
}

// Perchance list (main.pjs `streetCity`: Name|lat|lon), with built-in fallback.
const FALLBACK = [
  { name: "Paris, France", lat: 48.8566, lon: 2.3522 },
  { name: "Mouscron, Belgium", lat: 50.7437, lon: 3.2143 },
  { name: "New York, USA", lat: 40.7128, lon: -74.006 },
  { name: "Tokyo, Japan", lat: 35.6762, lon: 139.6503 },
];
export function cityList() {
  try {
    if (typeof root !== "undefined" && root.streetCity) {
      const out = [];
      for (const n of root.streetCity.selectAll) {
        const parts = String(n.evaluateItem).split("|");
        if (parts.length === 3 && isFinite(+parts[1]) && isFinite(+parts[2])) {
          out.push({ name: parts[0].trim(), lat: +parts[1], lon: +parts[2] });
        }
      }
      if (out.length) return out;
    }
  } catch (e) { /* fall through */ }
  return FALLBACK;
}
export function randomCity() {
  const list = cityList();
  return list[Math.floor(Math.random() * list.length)];
}

export async function searchPlace(q) {
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(q);
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("search failed");
  const arr = await r.json();
  if (!arr.length) return null;
  return { name: arr[0].display_name.split(",").slice(0, 2).join(","), lat: +arr[0].lat, lon: +arr[0].lon };
}

// Earth-local direction -> geographic lat/lon (matches THREE.SphereGeometry UVs
// used by the Blue Marble texture: u=0 at lon -180 on local -X).
export function dirToLatLon(lx, ly, lz) {
  const l = Math.hypot(lx, ly, lz) || 1;
  const y = Math.max(-1, Math.min(1, ly / l));
  const theta = Math.acos(y);
  let phi = Math.atan2(lz / l, -(lx / l));
  if (phi < 0) phi += Math.PI * 2;
  return { lat: 90 - (theta * 180) / Math.PI, lon: (phi / (Math.PI * 2)) * 360 - 180 };
}

// World-space offset-from-center direction -> lat/lon via the mesh matrix
// (accounts for axial tilt + daily spin, so it matches the visible texture).
export function surfaceLatLon(earth, dirWorld) {
  earth.mesh.updateWorldMatrix(true, false);
  const p = earth.mesh.position.clone().add(dirWorld);
  const local = earth.mesh.worldToLocal(p);
  return dirToLatLon(local.x, local.y, local.z);
}
export function earthViewLatLon(earth, camera) {
  const dir = camera.position.clone().sub(earth.mesh.position);
  if (dir.lengthSq() < 1e-12) dir.set(0, 1, 0);
  return surfaceLatLon(earth, dir.normalize());
}

export async function openStreetMap({ lat, lon, zoom = 16.5, label = "", cinematic = false }) {
  const ov = $("streetOv");
  ov.hidden = false;
  ov.style.opacity = "";
  setStatus(cinematic ? "Diving from orbit…" : "Loading 3D street map…");
  setPlace(label);
  try {
    await loadLib();
  } catch (e) {
    setStatus("Could not load the map library (network?). Close and retry.", true);
    return;
  }
  // Globe projection cannot do terrain relief (black frames) — so the map
  // lives as a globe when far (zoom < 9, no terrain) and switches to flat
  // mercator + terrain relief for the street levels. The swap is invisible
  // mid-flight and gives both: a real globe to dive from / return to, and
  // 3D relief in the streets.
  const applyViewMode = () => {
    if (!map) return;
    let z = 16;
    try { z = map.getZoom(); } catch (e) { /* noop */ }
    const wantGlobe = z < 9;
    try {
      if (wantGlobe && currentProj !== "globe") { map.setProjection({ type: "globe" }); currentProj = "globe"; }
      else if (!wantGlobe && currentProj !== "mercator") { map.setProjection({ type: "mercator" }); currentProj = "mercator"; }
    } catch (e) { /* keep current projection */ }
    try {
      if (!wantGlobe && z >= 10) {
        if (!map.getSource("terrarium")) {
          map.addSource("terrarium", {
            type: "raster-dem",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 15,
          });
        }
        map.setTerrain({ source: "terrarium", exaggeration: 1.0 });
      } else if (map.getTerrain && map.getTerrain()) {
        map.setTerrain(null);
      }
    } catch (e) { /* offline terrain -> flat map, still fine */ }
  };
  if (!map) {
    map = new window.maplibregl.Map({
      container: "streetMap",
      style: STYLE_URL,
      center: [lon, lat],
      zoom: cinematic ? 2.5 : zoom,
      pitch: cinematic ? 0 : 60,
      bearing: cinematic ? 0 : -20,
      maxPitch: 85,
      antialias: true,
      canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true }, // screenshots stay readable
      attributionControl: { compact: true },
    });
    map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("style.load", () => {
      applyViewMode();
    });
    map.on("load", () => setStatus(""));
    map.on("error", (e) => {
      lastMapError = (e && e.error && String(e.error.message || e.error)) || "map error";
      setStatus("");
    });
    // zooming out of the globe hands back to the space view (seamless out).
    // Projection/terrain swaps never happen mid-flight (black frames) —
    // they apply live during manual zooms and on moveend after flights.
    // Only programmatic flights (flyTo/zoomTo: no originalEvent) defer the
    // projection/terrain swaps to moveend — manual zooms switch live.
    map.on("movestart", (e) => { flying = !e.originalEvent; });
    map.on("moveend", () => { flying = false; applyViewMode(); });
    map.on("zoom", () => {
      if (!flying) applyViewMode();
      if (returnArmed && returnHandler && map.getZoom() < 2.0) {
        returnArmed = false;
        const cc = map.getCenter();
        try { returnHandler({ lat: cc.lat, lon: cc.lng }); } catch (e) { /* noop */ }
      }
    });
  } else {
    map.resize(); // viewport may have changed while hidden (phone rotation…)
    applyViewMode();
  }
  armReturn();
  if (cinematic) {
    // start on the globe, then dive to the streets — one continuous flight
    try { map.jumpTo({ center: [lon, lat], zoom: 2.5, pitch: 0, bearing: 0 }); } catch (e) { /* noop */ }
    setTimeout(() => {
      if (!isStreetOpen()) return;
      try { map.flyTo({ center: [lon, lat], zoom: 16.5, pitch: 60, bearing: -20, duration: 5000 }); } catch (e) { /* noop */ }
    }, 800);
  } else {
    try { map.flyTo({ center: [lon, lat], zoom, pitch: 60, bearing: -20, duration: 2200 }); } catch (e) { /* noop */ }
  }
  // reveal once tiles start arriving even before full idle
  setTimeout(() => { if (isStreetOpen()) setStatus(""); }, 6000);
  map.resize();
}

// Test helper: drive the street-map zoom from the console/tests.
export function streetZoomTo(z) {
  if (map) { try { map.zoomTo(z, { duration: 1500 }); } catch (e) { /* noop */ } }
}

// Raw map handle (console experiments, tests).
export function streetMap() { return map; }

export function closeStreetMap() {
  $("streetOv").hidden = true;
}

// Wires the overlay toolbar. `here` must return {lat, lon, label} or null.
export function initStreetUI(here) {
  $("streetClose").addEventListener("click", closeStreetMap);
  $("streetRandom").addEventListener("click", async () => {
    const c = randomCity();
    await openStreetMap({ lat: c.lat, lon: c.lon, label: c.name });
  });
  $("streetHere").addEventListener("click", async () => {
    const h = here();
    if (!h) { setStatus("Stand on Earth (or select it) to use Here.", true); return; }
    await openStreetMap({ lat: h.lat, lon: h.lon, label: h.label });
  });
  const go = async () => {
    const q = $("streetSearch").value.trim();
    if (!q) return;
    setStatus("Searching…");
    try {
      const hit = await searchPlace(q);
      if (!hit) { setStatus("No results for that address.", true); return; }
      await openStreetMap({ lat: hit.lat, lon: hit.lon, zoom: 17, label: hit.name });
    } catch (e) {
      setStatus("Search failed (network?).", true);
    }
  };
  $("streetGo").addEventListener("click", go);
  $("streetSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
    e.stopPropagation(); // don't drive the space view while typing
  });
}
