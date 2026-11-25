// main.js — Celestia Web: real-time 3D space visualization (Three.js).
// Celestia-style controls: drag rotate, wheel zoom, G goto, F follow,
// time warp, labels/orbits/constellation toggles, search, guided tour.

import * as THREE from "../../vendor/p2ga5t-three_0.160.0.js";
import {
  dateToJD, jdToUTCString, planetEcliptic, orbitSamples,
  radecToVec, eqToEcl, AU_KM,
} from "./astro.js";
import { PLANETS, MOONS, spectralColor } from "./data.js";
import { REAL_STARS, CONST_LINES, CONST_CENTERS, CONST_BOUNDS } from "./sky_real.js";
import { DSO } from "./dso.js";
import { MINOR_BODIES, COMETS } from "./minor.js";
import { planetTexture, glowTexture, ringTexture } from "./textures.js";
import { initEarthHD } from "./earth.js";
import { initSatellites, updateSatellites, setSatsVisible, satsStatus, satCount, issLatLon } from "./satellites.js";
import { initEvents, updateEvents, setEventsVisible, eventsStatus } from "./events.js";
import { initStreetUI, openStreetMap, closeStreetMap, isStreetOpen, setReturnHandler,
  surfaceLatLon, earthViewLatLon, randomCity, streetZoomTo, streetMap } from "./streetmap.js";
import { streetDebug } from "./streetmap.js";

const AU = 10;              // scene units per AU
const STAR_R = 30000;       // celestial sphere radius
const MOON_EXAG = 30;       // moon distance exaggeration

const VIS_R = { // visual radii, scene units
  mercury: 0.10, venus: 0.19, earth: 0.20, mars: 0.14, jupiter: 0.56,
  saturn: 0.47, uranus: 0.32, neptune: 0.31, pluto: 0.06, sun: 1.6,
  moon: 0.055, io: 0.05, europa: 0.045, ganymede: 0.07, callisto: 0.065,
  titan: 0.07, rhea: 0.035, titania: 0.035, triton: 0.045, charon: 0.03,
};

const $ = (id) => document.getElementById(id);

// ---------------- state ----------------
const state = {
  jd: dateToJD(new Date()),
  warpIdx: 3,          // index into WARPS
  paused: false,
  target: new THREE.Vector3(),
  theta: 0.8, phi: 1.12, dist: 8,
  follow: null,        // obj entry being followed
  selected: null,
  surface: null,      // {body, dir, yaw, pitch, prev} when standing on a world
  showLabels: true, showOrbits: true, showConst: true, showGrid: false,
  showBounds: false, showDSO: true, showBelts: true, showSats: true, showEvents: true,
  anim: null,          // goto animation
  tour: null,          // tour timer
  spinAngles: new Map(),
};
const WARPS = [
  { label: "real-time", dps: 1 / 86400 },
  { label: "1 min/s", dps: 1 / 1440 },
  { label: "1 hour/s", dps: 1 / 24 },
  { label: "1 day/s", dps: 1 },
  { label: "1 week/s", dps: 7 },
  { label: "1 month/s", dps: 30.44 },
  { label: "1 year/s", dps: 365.25 },
];

// ---------------- renderer/scene ----------------
const host = $("sceneCtn");
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200000);

const sunLight = new THREE.PointLight(0xfff4e0, 2.4, 0, 0); // decay 0 = no falloff
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.14));

function resize() {
  const w = host.clientWidth || 2, h = host.clientHeight || 2;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

// ---------------- object registry ----------------
const objs = new Map(); // id -> entry
const pickMeshes = [];
function reg(entry) { objs.set(entry.id, entry); return entry; }
function eclToScene(x, y, z, out) { // ecliptic AU -> scene units
  out.set(x * AU, z * AU, y * AU);
  return out;
}

// Sun
{
  const geo = new THREE.SphereGeometry(VIS_R.sun, 48, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture("rgba(255,200,120,1)"), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(9);
  scene.add(glow);
  const pos = new THREE.Vector3();
  reg({ id: "sun", name: "Sun", kind: "star-local", mesh, glow, visR: VIS_R.sun,
    radiusKm: 695700, desc: "G2V main-sequence star; 99.86% of system mass.",
    getPos: (out) => out.set(0, 0, 0) });
  pickMeshes.push(mesh);
}

// Planets
const planetList = [];
for (const p of PLANETS) {
  const visR = VIS_R[p.id] || 0.15;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(visR, 48, 32),
    new THREE.MeshStandardMaterial({ map: planetTexture(p.tex, p.name.length * 31 + 7), roughness: 0.95, metalness: 0 })
  );
  mesh.rotation.z = (p.tiltDeg || 0) * Math.PI / 180;
  scene.add(mesh);
  // invisible-ish pick proxy for small bodies
  const pickR = Math.max(visR * 1.9, 0.10);
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(pickR, 12, 8),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true })
  );
  scene.add(proxy);
  const pos = new THREE.Vector3();
  const entry = reg({ id: p.id, name: p.name, kind: p.dwarf ? "dwarf" : "planet",
    mesh, proxy, visR, pickR, el: p, radiusKm: p.radiusKm, periodStr: p.periodStr,
    rotDays: p.rotDays, tiltDeg: p.tiltDeg, desc: p.desc,
    getPos: (out) => { const e = planetEcliptic(p, state.jd); return eclToScene(e.x, e.y, e.z, out); } });
  planetList.push(entry);
  pickMeshes.push(proxy);
  proxy.userData.oid = p.id;
  mesh.userData.oid = p.id;
}

// Moons (circular inclined orbits around parent, phase-locked to JD)
const moonList = [];
{
  const byParent = new Map();
  for (const m of MOONS) {
    if (!byParent.has(m.parent)) byParent.set(m.parent, []);
    byParent.get(m.parent).push(m);
  }
  for (const [, arr] of byParent) {
    arr.sort((a, b) => a.a3km - b.a3km);
    arr.forEach((m, i) => {
      const parent = objs.get(m.parent);
      const visR = VIS_R[m.id] || 0.04;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(visR, 32, 24),
        new THREE.MeshStandardMaterial({ map: planetTexture(m.tex, m.name.length * 57 + 3), roughness: 1 })
      );
      scene.add(mesh);
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(visR * 2, 0.09), 10, 8),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true })
      );
      scene.add(proxy);
      const realAU = (m.a3km * 1000) / AU_KM;
      let vis = realAU * AU * MOON_EXAG;
      const minV = parent.visR * 2.4 + i * 0.13;
      if (i > 0) vis = Math.max(vis, arr[i - 1]._vis + 0.14);
      vis = Math.max(vis, minV);
      m._vis = vis;
      const phase0 = (m.name.length * 1.7) % (Math.PI * 2);
      const dir = m.period < 0 ? -1 : 1;
      const w = dir * 2 * Math.PI / Math.abs(m.period); // rad per day
      const incl = 0.06 + (i * 0.035);
      const entry = reg({ id: m.id, name: m.name, kind: "moon", mesh, proxy,
        visR, parent, radiusKm: m.radiusKm,
        periodStr: `${Math.abs(m.period).toFixed(m.period < 4 ? 2 : 1)} days${m.period < 0 ? " ret." : ""}`,
        distKm: `${m.a3km.toLocaleString("en-US")} km`, desc: m.desc,
        getPos: (out) => {
          parent.getPos(out);
          const a = phase0 + w * (state.jd - 2451545.0);
          out.x += Math.cos(a) * vis;
          out.z += Math.sin(a) * vis;
          out.y += Math.sin(a * 0.9 + i) * vis * incl;
          return out;
        } });
      moonList.push(entry);
      proxy.userData.oid = m.id;
      mesh.userData.oid = m.id;
      pickMeshes.push(proxy);
      // orbit ring around parent
      const seg = 96, pts = new Float32Array((seg + 1) * 3);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        pts[k * 3] = Math.cos(a) * vis; pts[k * 3 + 1] = 0; pts[k * 3 + 2] = Math.sin(a) * vis;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x55607a, transparent: true, opacity: 0.5 }));
      line.userData.moonOrbit = entry;
      scene.add(line);
      entry.orbitLine = line;
    });
  }
}
objs.get("sun").mesh.userData.oid = "sun";

// ---------------- minor worlds + comets (real elements) ----------------
const minorList = [], cometList = [];
function smallBody(def, kind, visR, texKind) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(visR, 32, 24),
    new THREE.MeshStandardMaterial({ map: planetTexture(texKind, def.name.length * 91 + 5), roughness: 1 })
  );
  if (def.color && kind === "comet") mesh.material.color.set(def.color);
  scene.add(mesh);
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(visR * 2.2, 0.10), 10, 8),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true })
  );
  scene.add(proxy);
  const entry = reg({ id: def.id, name: def.name, kind, mesh, proxy, visR,
    el: def, radiusKm: def.radiusKm || 0, periodStr: def.periodStr, desc: def.desc,
    getPos: (out) => { const e = planetEcliptic(def, state.jd); return eclToScene(e.x, e.y, e.z, out); } });
  proxy.userData.oid = def.id;
  mesh.userData.oid = def.id;
  pickMeshes.push(proxy);
  return entry;
}
for (const b of MINOR_BODIES) {
  const visR = 0.02 + b.radiusKm / 22000;
  const e = smallBody(b, b.id === "ceres" || b.id === "eris" || b.id === "haumea" || b.id === "makemake" ? "dwarf" : "minor", visR, "rock");
  e.periodStr = (Math.pow(b.a, 1.5)).toFixed(b.a > 10 ? 0 : 1) + (b.a > 10 ? " years" : " yrs");
  e.color = b.color;
  minorList.push(e);
}
for (const c of COMETS) {
  const e = smallBody(c, "comet", 0.045, "rock");
  e.periodStr = "≈ " + (c.a < 20 ? Math.pow(c.a, 1.5).toFixed(1) + " yrs" : Math.round(Math.pow(c.a, 1.5)).toLocaleString("en-US") + " yrs");
  e.q = c.q;
  const coma = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(180,220,255,1)"),
    color: 0xbfe0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(coma);
  e.coma = coma;
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const tail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.55 }));
  tail.frustumCulled = false;
  scene.add(tail);
  e.tail = tail;
  cometList.push(e);
}

// (orbit lines for these are picked up by rebuildOrbits below)

// ---------------- atmosphere shells (fresnel glow) ----------------
const atmoMat = (color, pw) => new THREE.ShaderMaterial({
  uniforms: { c: { value: new THREE.Color(color) }, p: { value: pw } },
  vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); " +
    "gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform vec3 c; uniform float p; varying vec3 vN; void main(){ " +
    "float i = pow(max(0.0, 0.68 - dot(vN, vec3(0.0, 0.0, 1.0))), p); gl_FragColor = vec4(c, 1.0) * i; }",
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});
function addAtmo(bodyId, color, scale, pw) {
  const b = objs.get(bodyId);
  if (!b) return;
  const m = new THREE.Mesh(new THREE.SphereGeometry(b.visR * scale, 48, 32), atmoMat(color, pw));
  b.mesh.add(m);
  b.atmo = { color: new THREE.Color(color) };
}
addAtmo("venus", 0xe8d9a0, 1.22, 3.0);
addAtmo("earth", 0x4d9fff, 1.18, 3.2);
addAtmo("mars", 0xd18a5a, 1.14, 4.0);
addAtmo("jupiter", 0xd8b48f, 1.12, 3.4);
addAtmo("saturn", 0xe3cf9e, 1.12, 3.4);
addAtmo("uranus", 0x9fe3e8, 1.2, 3.0);
addAtmo("neptune", 0x5f7fe8, 1.2, 3.0);
addAtmo("titan", 0xe09a40, 1.3, 2.6);

// globe.gl / Cesium-inspired HD Earth (real NASA imagery, day-night shader,
// ocean glint, terrain relief, clouds, sun-aware atmosphere)
const earthHD = initEarthHD(objs.get("earth"), scene, renderer);

// Live layers (lazy, keyless): real satellites via SGP4 + CelesTrak TLE
// (satvis/godseye technique), live quakes (USGS) + hazards (NASA EONET).
initSatellites(objs.get("earth"), scene).catch(() => {});
initEvents(objs.get("earth")).catch(() => {});

// Street-level 3D map (MapLibre + OpenFreeMap, no key): "Here" resolves to
// where you stand (surface mode) or what you look at (Earth selected).
initStreetUI(() => {
  const e = objs.get("earth");
  if (state.surface && state.surface.body === e) {
    const g = surfaceLatLon(e, state.surface.dir);
    return { lat: g.lat, lon: g.lon, label: `Surface of Earth (${g.lat.toFixed(2)}°, ${g.lon.toFixed(2)}°)` };
  }
  if (state.selected === e || state.follow === e) {
    const g = earthViewLatLon(e, camera);
    return { lat: g.lat, lon: g.lon, label: `Earth view (${g.lat.toFixed(2)}°, ${g.lon.toFixed(2)}°)` };
  }
  return null;
});
async function openEarthStreets() {
  const e = objs.get("earth");
  const g = (state.surface && state.surface.body === e)
    ? surfaceLatLon(e, state.surface.dir)
    : earthViewLatLon(e, camera);
  await openStreetMap({ lat: g.lat, lon: g.lon, label: `Earth (${g.lat.toFixed(2)}°, ${g.lon.toFixed(2)}°)`, cinematic: true });
}
// seamless dive: zooming all the way into Earth hands over to the street globe
let diving = false;
function tryDiveToStreets() {
  if (diving || isStreetOpen()) return false;
  const e = objs.get("earth");
  if (state.follow !== e && state.selected !== e) return false;
  if (state.dist > e.visR * 1.9) return false;
  diving = true;
  stopTour();
  openEarthStreets().finally(() => { diving = false; });
  return true;
}
// seamless return: zooming out of the street globe fades back to space above that spot
setReturnHandler((ll) => {
  const e = objs.get("earth");
  const th = (90 - ll.lat) * Math.PI / 180, ph = (ll.lon + 180) * Math.PI / 180;
  e.mesh.updateWorldMatrix(true, false);
  const world = e.mesh.localToWorld(new THREE.Vector3(
    -Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph))).sub(e.mesh.position).normalize();
  const ov = $("streetOv");
  ov.style.opacity = "0";
  stopTour();
  state.follow = e;
  state.theta = Math.atan2(world.x, world.z);
  state.phi = Math.acos(Math.max(-1, Math.min(1, world.y)));
  e.getPos(tmpV);
  state.target.copy(tmpV);
  state.anim = { t: 0, dur: 1.8, fromT: state.target.clone(), fromD: 1.0, toD: 3.4, live: e };
  state.selected = e;
  selectObj("earth");
  highlightBrowser();
  setTimeout(() => { ov.hidden = true; ov.style.opacity = ""; }, 700);
});

// day-sky colors for surface mode (null = airless black sky)
objs.get("earth").skyDay = new THREE.Color(0x6fa8dc);
objs.get("venus").skyDay = new THREE.Color(0xc7a86a);
objs.get("mars").skyDay = new THREE.Color(0xb97a4e);
objs.get("titan").skyDay = new THREE.Color(0xd89438);

// ---------------- asteroid + Kuiper belts ----------------
const beltGroup = new THREE.Group();
scene.add(beltGroup);
const belts = [];
function makeBelt(count, rMin, rMax, iMax, size, tint) {
  const pos = new Float32Array(count * 3);
  const parts = [];
  const rnd = (() => { let s = (count * 7919 + 5) >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  for (let i = 0; i < count; i++) {
    const r = rMin + Math.pow(rnd(), 0.8) * (rMax - rMin);
    parts.push({ r: r * AU, a: rnd() * Math.PI * 2, sp: (0.98560736 / Math.pow(r, 1.5)) * Math.PI / 180, // rad/day
      y: (rnd() + rnd() - 1) * iMax * AU });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, color: tint, transparent: true, opacity: 0.7, depthWrite: false });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  beltGroup.add(pts);
  belts.push({ pts, parts });
}
makeBelt(2200, 2.06, 3.4, 0.12, 1.6, 0xb0a898);
makeBelt(1200, 30, 55, 0.25, 1.8, 0x9aa4c0);

// Saturn rings (+ faint Uranus rings)
function addRings(planetId, innerR, outerR, opacity) {
  const p = objs.get(planetId);
  const geo = new THREE.RingGeometry(innerR, outerR, 128, 1);
  // remap uvs radially so the 1D ring texture maps across the band
  const uv = geo.attributes.uv, posA = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < uv.count; i++) {
    v.fromBufferAttribute(posA, i);
    const t = (v.length() - innerR) / (outerR - innerR);
    uv.setXY(i, t, 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({ map: ringTexture(), side: THREE.DoubleSide,
    transparent: true, opacity, depthWrite: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2 + (p.el.tiltDeg || 0) * Math.PI / 180 * 0.35;
  p.mesh.add(ring);
}
addRings("saturn", VIS_R.saturn * 1.24, VIS_R.saturn * 2.27, 0.95);
addRings("uranus", VIS_R.uranus * 1.55, VIS_R.uranus * 1.95, 0.22);

// Planet orbit lines
const orbitGroup = new THREE.Group();
scene.add(orbitGroup);
const orbitLines = new Map();
function rebuildOrbits() {
  for (const p of planetList.concat(minorList, cometList)) {
    let line = orbitLines.get(p.id);
    const pts = orbitSamples(p.el, state.jd, 220);
    const arr = new Float32Array((pts.length) * 3);
    pts.forEach((q, i) => { arr[i * 3] = q[0] * AU; arr[i * 3 + 1] = q[2] * AU; arr[i * 3 + 2] = q[1] * AU; });
    if (!line) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x4d5c78, transparent: true, opacity: 0.65 }));
      orbitGroup.add(line);
      orbitLines.set(p.id, line);
    } else {
      line.geometry.attributes.position.array.set(arr);
      line.geometry.attributes.position.needsUpdate = true;
    }
  }
}
rebuildOrbits();

// Ecliptic polar grid
const grid = new THREE.PolarGridHelper(320, 12, 10, 64, 0x2a3a55, 0x1a2438);
grid.material.transparent = true;
grid.material.opacity = 0.5;
grid.visible = false;
scene.add(grid);

// ---------------- stars (real Hipparcos-derived catalog) ----------------
const starGroup = new THREE.Group();
scene.add(starGroup);
const starPosByName = new Map();
const STAR_INFO = new Map(); // disp name -> {ra,dec,app,sp,distLy}
const starMats = []; // Points materials (for surface-mode day dimming)
{
  const bins = { big: [], mid: [], small: [], faint: [] };
  const tmp = new THREE.Vector3();
  for (const [ra, dec, mag, sp, distLy, name] of REAL_STARS) {
    const v = eqToEcl(radecToVec(ra, dec));
    eclToScene(v[0], v[1], v[2], tmp).setLength(STAR_R);
    const col = spectralColor(sp);
    const fade = Math.min(1, Math.pow(2.512, -(mag - 0.5) * 0.35) + 0.25);
    const rec = { p: tmp.clone(), c: [col[0] * fade, col[1] * fade, col[2] * fade], mag, name };
    (mag < 1.6 ? bins.big : mag < 3 ? bins.mid : mag < 4.5 ? bins.small : bins.faint).push(rec);
    if (name) {
      if (!starPosByName.has(name)) {
        starPosByName.set(name, tmp.clone());
        STAR_INFO.set(name, { ra, dec, app: mag, sp, distLy });
      }
    }
  }
  const mk = (list, size, op) => {
    if (!list.length) return;
    const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
    list.forEach((s, i) => { pos.set([s.p.x, s.p.y, s.p.z], i * 3); col.set(s.c, i * 3); });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size, sizeAttenuation: false,
      vertexColors: true, transparent: true, opacity: op, depthWrite: false });
    m.userData.baseOp = op;
    starMats.push(m);
    starGroup.add(new THREE.Points(g, m));
  };
  mk(bins.big, 4.5, 1); mk(bins.mid, 3, 0.95); mk(bins.small, 2.2, 0.9); mk(bins.faint, 1.8, 0.85);

  // procedural faint field: uniform + galactic band
  const N = 5200;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const pole = eqToEcl(radecToVec(192.86, 27.13)); // galactic north (ecliptic)
  const rnd = (() => { let s = 1234567; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  for (let i = 0; i < N; i++) {
    let x, y, z;
    if (i < 3000) { // band-concentrated
      const u = rnd() * Math.PI * 2;
      const off = (rnd() + rnd() + rnd() - 1.5) * 0.35; // gaussian-ish lat spread
      // basis perpendicular to pole
      const bx = [1, 0, 0], bz = pole;
      x = Math.cos(u); y = 0; z = Math.sin(u);
      // mix toward pole by off
      const vx = x * Math.cos(off), vy = Math.sin(off), vz = z * Math.cos(off);
      // rotate arbitrary frame onto pole frame: cheap approx, renormalize
      const l = Math.hypot(vx, vy, vz);
      x = vx / l; y = vy / l; z = vz / l;
      // tilt frame so band matches galactic plane: rotate around x by angle between y-axis and pole
      const tilt = Math.acos(Math.min(1, Math.abs(pole[1])));
      const c = Math.cos(tilt * 0.9), s = Math.sin(tilt * 0.9);
      const y2 = c * y - s * z, z2 = s * y + c * z;
      y = y2; z = z2;
    } else {
      const u = rnd() * Math.PI * 2, vv = rnd() * 2 - 1;
      const r = Math.sqrt(1 - vv * vv);
      x = r * Math.cos(u); y = vv; z = r * Math.sin(u);
    }
    const t = new THREE.Vector3(x * STAR_R, z * STAR_R, y * STAR_R);
    pos.set([t.x, t.y, t.z], i * 3);
    const b = 0.25 + rnd() * 0.55, pick = rnd();
    const cc = pick < 0.62 ? [b, b, b * 1.02] : pick < 0.8 ? [b, b * 0.85, b * 0.66] : [b * 0.75, b * 0.85, b];
    col.set(cc, i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const fm = new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false,
    vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
  fm.userData.baseOp = 0.85;
  starMats.push(fm);
  starGroup.add(new THREE.Points(g, fm));

  // glow sprites for the brightest
  const glowTex = glowTexture("rgba(255,255,255,1)");
  for (const [ra, dec, mag, sp, distLy, name] of REAL_STARS) {
    if (mag > 0.6 || !name) continue;
    const v = eqToEcl(radecToVec(ra, dec));
    const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xbfd0ff,
      transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    eclToScene(v[0], v[1], v[2], sp2.position).setLength(STAR_R);
    sp2.scale.setScalar(900 - mag * 220);
    sp2.material.userData = { baseOp: 0.5 };
    starGroup.add(sp2);
  }
}

// real named stars for labels (bright subset)
const BRIGHT_STARS = REAL_STARS.filter((s) => s[5] && s[2] < 1.6).map((s) => s[5]);
// Constellation figures (real IAU lines) + boundary lines + label anchors
const constGroup = new THREE.Group();
scene.add(constGroup);
const boundGroup = new THREE.Group();
scene.add(boundGroup);
const constCentroids = [];
{
  const tmp = new THREE.Vector3();
  const verts = [];
  for (const [abbr, name, lines] of CONST_LINES) {
    for (const poly of lines) {
      for (let i = 0; i + 1 < poly.length; i++) {
        for (const [ra, dec] of [poly[i], poly[i + 1]]) {
          const v = eqToEcl(radecToVec(ra, dec));
          eclToScene(v[0], v[1], v[2], tmp).setLength(STAR_R * 0.995);
          verts.push(tmp.x, tmp.y, tmp.z);
        }
      }
    }
    const ctr = CONST_CENTERS[abbr];
    if (ctr) {
      const v = eqToEcl(radecToVec(ctr[0], ctr[1]));
      eclToScene(v[0], v[1], v[2], tmp).setLength(STAR_R * 0.995);
      constCentroids.push({ name, pos: tmp.clone() });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  const constMat = new THREE.LineBasicMaterial({ color: 0x5f7fb8, transparent: true, opacity: 0.55 });
  constMat.userData.baseOp = 0.55;
  constGroup.add(new THREE.LineSegments(g, constMat));
  // IAU boundaries (B1875, precessed to J2000 at build time)
  const bv = [];
  for (const q of CONST_BOUNDS) {
    for (const [ra, dec] of [[q[0], q[1]], [q[2], q[3]]]) {
      const v = eqToEcl(radecToVec(ra, dec));
      eclToScene(v[0], v[1], v[2], tmp).setLength(STAR_R * 0.993);
      bv.push(tmp.x, tmp.y, tmp.z);
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bv), 3));
  const boundMat = new THREE.LineBasicMaterial({ color: 0x8a6f3a, transparent: true, opacity: 0.4 });
  boundMat.userData.baseOp = 0.4;
  boundGroup.add(new THREE.LineSegments(bg, boundMat));
  boundGroup.visible = false;
}
// materials dimmed in daylight (surface mode)
const skyLineMats = [];
{
  constGroup.children.forEach((c) => { if (c.material) skyLineMats.push(c.material); });
  boundGroup.children.forEach((c) => { if (c.material) skyLineMats.push(c.material); });
}

// ---------------- deep-sky objects (Messier) ----------------
const dsoGroup = new THREE.Group();
scene.add(dsoGroup);
const DSO_MAP = new Map();
const DSO_TYPE = { Gx: ["Galaxy", 0xffd9a0], GC: ["Globular cluster", 0xfff2b0], OC: ["Open cluster", 0xb0d0ff],
  NB: ["Nebula", 0xff9a9a], HII: ["Nebula", 0xff9a9a], PN: ["Planetary nebula", 0x9affd0],
  SNR: ["Supernova remnant", 0xff9a70], BN: ["Dark nebula", 0x8a7a5a], "C+N": ["Cluster + nebulosity", 0xd0e8ff] };
{
  const tmp = new THREE.Vector3();
  const bins = [[], [], []];
  for (const d of DSO) {
    const v = eqToEcl(radecToVec(d.ra, d.dec));
    eclToScene(v[0], v[1], v[2], tmp).setLength(STAR_R * 0.99);
    const t = DSO_TYPE[d.type] || ["Deep-sky object", 0xb0b0ff];
    const e = { ...d, pos: tmp.clone(), typeName: t[0], color: t[1] };
    DSO_MAP.set(d.m, e);
    (d.mag < 6.5 ? bins[0] : d.mag < 9 ? bins[1] : bins[2]).push(e);
    // pick proxy
    const angR = Math.max((d.size / 60) * Math.PI / 180 * STAR_R, 140);
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(angR, 8, 6),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true }));
    proxy.position.copy(e.pos);
    proxy.userData.dso = d.m;
    dsoGroup.add(proxy);
    pickMeshes.push(proxy);
  }
  const sizes = [5, 3.4, 2.6], ops = [0.95, 0.9, 0.8];
  bins.forEach((list, bi) => {
    if (!list.length) return;
    const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
    list.forEach((e, i) => {
      pos.set([e.pos.x, e.pos.y, e.pos.z], i * 3);
      const c = new THREE.Color(e.color);
      col.set([c.r, c.g, c.b], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: sizes[bi], sizeAttenuation: false,
      vertexColors: true, transparent: true, opacity: ops[bi], depthWrite: false });
    m.userData.baseOp = ops[bi];
    starMats.push(m);
    dsoGroup.add(new THREE.Points(g, m));
  });
}
function selectDSO(m) {
  stopTour();
  const d = DSO_MAP.get(m);
  if (!d) return;
  state.selected = null;
  highlightBrowser();
  infoBody.innerHTML =
    `<h3>M${d.m}${d.name ? " — " + d.name : ""}</h3><div class=type>${d.typeName}</div>
     <div class=row><span>Magnitude</span><b>${d.mag === 99 ? "—" : d.mag.toFixed(1)}</b></div>
     <div class=row><span>Size</span><b>${d.size ? d.size + "′" : "—"}</b></div>
     <div class=row><span>RA / Dec</span><b>${d.ra.toFixed(2)}° / ${d.dec.toFixed(2)}°</b></div>
     <p>Deep-sky object. Press Fly-to to travel there; Home returns to Earth.</p>
     <div class=btnrow><button data-act=fly>Fly to</button></div>`;
  infoEl.hidden = false;
  infoBody.querySelector("button").addEventListener("click", () => flyToPos(d.pos));
}

// ---------------- celestial equator + galactic equator ----------------
const eqGroup = new THREE.Group();
scene.add(eqGroup);
function greatCircle(poleArr, color, op) {
  const pole = new THREE.Vector3(...poleArr).normalize();
  const u = new THREE.Vector3(1, 0, 0).cross(pole).lengthSq() < 1e-6
    ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(pole, u).normalize();
  const e2 = new THREE.Vector3().crossVectors(pole, e1).normalize();
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    pts.push(new THREE.Vector3().addScaledVector(e1, Math.cos(a) * STAR_R * 0.99)
      .addScaledVector(e2, Math.sin(a) * STAR_R * 0.99));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  eqGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op })));
}
{
  // equatorial plane normal (in ecliptic coords): eqToEcl of (0,0,1)
  greatCircle(eqToEcl([0, 0, 1]), 0x3a5a8a, 0.5);
  // galactic plane normal: galactic north in ecliptic coords
  greatCircle(eqToEcl(radecToVec(192.86, 27.13)), 0x6a4a6a, 0.35);
  eqGroup.visible = false;
}

// ---------------- labels ----------------
const labelLayer = $("labels");
const labelPool = new Map(); // key -> div
function labelEl(key, cls) {
  let el = labelPool.get(key);
  if (!el) {
    el = document.createElement("div");
    el.className = "lbl " + cls;
    el.dataset.key = key;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (key.startsWith("st:")) selectStar(key.slice(3));
      else if (key.startsWith("dso:")) selectDSO(+key.slice(4));
      else selectObj(key);
    });
    labelLayer.appendChild(el);
    labelPool.set(key, el);
  }
  return el;
}
const projV = new THREE.Vector3();
function placeLabel(key, cls, text, worldPos, yOff, visible) {
  const el = labelEl(key, cls);
  if (!visible) { el.style.display = "none"; return; }
  projV.copy(worldPos).project(camera);
  if (projV.z > 1 || projV.z < -1) { el.style.display = "none"; return; }
  const w = host.clientWidth, h = host.clientHeight;
  const x = (projV.x * 0.5 + 0.5) * w, y = (-projV.y * 0.5 + 0.5) * h + yOff;
  if (x < -80 || x > w + 80 || y < -30 || y > h + 30) { el.style.display = "none"; return; }
  el.style.display = "block";
  el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-130%)`;
  if (el.textContent !== text) el.textContent = text;
}

// ---------------- info / browser / search ----------------
const infoEl = $("infoPanel"), infoBody = $("infoBody");
function fmtKm(km) {
  if (km >= 1e9) return (km / 1e9).toFixed(2) + " B km";
  if (km >= 1e6) return (km / 1e6).toFixed(2) + " M km";
  if (km >= 1e4) return (km / 1e3).toFixed(1) + " k km";
  return Math.round(km).toLocaleString("en-US") + " km";
}
function selectObj(id) {
  stopTour();
  const o = objs.get(id) || null;
  state.selected = o;
  if (!o) { infoEl.hidden = true; return; }
  const kindName = { planet: "Planet", dwarf: "Dwarf planet", minor: "Small body", comet: "Comet",
    moon: "Moon", "star-local": "Star" }[o.kind] || o.kind;
  let distTxt = "";
  if (o.kind === "planet" || o.kind === "dwarf" || o.kind === "minor") {
    const period = o.periodStr || (o.el ? (Math.pow(o.el.a, 1.5) > 40
      ? Math.round(Math.pow(o.el.a, 1.5)).toLocaleString("en-US") + " years"
      : Math.pow(o.el.a, 1.5).toFixed(1) + " years") : "—");
    distTxt = o.el
      ? `<div class=row><span>Semi-major</span><b>${o.el.a.toFixed(3)} AU (${fmtKm(o.el.a * AU_KM)})</b></div>
         <div class=row><span>Period</span><b>${period}</b></div>`
      : "";
  } else if (o.kind === "comet") {
    distTxt = o.el
      ? `<div class=row><span>Perihelion</span><b>${o.q.toFixed(2)} AU</b></div>
         <div class=row><span>Period</span><b>${o.periodStr}</b></div>`
      : "";
  } else if (o.kind === "moon") {
    const pname = typeof o.parent === "string" ? o.parent : (o.parent && o.parent.name) || o.parent;
    distTxt = `<div class=row><span>Orbits</span><b>${pname}</b></div>
       <div class=row><span>Distance</span><b>${o.distKm}</b></div>
       <div class=row><span>Period</span><b>${o.periodStr}</b></div>`;
  } else if (o.kind === "star-local") {
    distTxt = `<div class=row><span>Type</span><b>G2V main sequence</b></div>
        <div class=row><span>Diameter</span><b>${fmtKm(o.radiusKm * 2)}</b></div>`;
  }
  const canLand = o.kind === "planet" || o.kind === "dwarf" || o.kind === "moon" || o.kind === "minor";
  let liveRows = "";
  if (o.id === "earth") {
    try {
      const iss = issLatLon(state.jd);
      const issTxt = iss ? `${iss.name} ${iss.lat.toFixed(1)}°, ${iss.lon.toFixed(1)}° · ${Math.round(iss.altKm)} km` : satsStatus();
      liveRows = `<div class=row><span>Live sats</span><b>${satCount() ? satCount() + " tracked" : satsStatus()}</b></div>
        <div class=row><span>ISS now</span><b>${issTxt}</b></div>
        <div class=row><span>Events</span><b>${eventsStatus()}</b></div>`;
    } catch (e) { /* layers still loading */ }
  }
  infoBody.innerHTML =
    `<h3>${o.name}</h3>
     <div class=type>${kindName}</div>
     ${o.radiusKm ? `<div class=row><span>Radius</span><b>${fmtKm(o.radiusKm)}</b></div>` : ""}${distTxt}${liveRows}
     <p>${o.desc || ""}</p>
     <div class=btnrow>
       <button data-act=goto>Goto (G)</button>
       <button data-act=follow>Follow (F)</button>
       ${canLand ? "<button data-act=surf>Surface (S)</button>" : ""}
        ${o.id === "earth" ? "<button data-act=streets>Streets 3D (M)</button>" : ""}
     </div>`;
  infoEl.hidden = false;
  infoBody.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.act === "goto") gotoObj(o);
    else if (b.dataset.act === "follow") followObj(o);
    else if (b.dataset.act === "surf") enterSurface(o);
    else if (b.dataset.act === "streets") openEarthStreets();
  }));
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// browser list
{
  const list = $("browserList");
  const mk = (o, indent) => {
    const d = document.createElement("div");
    d.className = "brow" + (indent ? " ind" : "");
    d.textContent = (indent ? "◦ " : "") + o.name;
    d.dataset.oid = o.id;
    d.addEventListener("click", () => { selectObj(o.id); highlightBrowser(); });
    d.addEventListener("dblclick", () => gotoObj(o));
    list.appendChild(d);
  };
  mk(objs.get("sun"));
  for (const p of planetList) {
    mk(p);
    for (const m of moonList.filter((m) => m.parent === p.id)) mk(m, true);
  }
  const sec = (t) => {
    const d = document.createElement("div");
    d.className = "browsec";
    d.textContent = t;
    list.appendChild(d);
  };
  sec("Minor worlds");
  for (const m of minorList) mk(m, true);
  sec("Comets");
  for (const m of cometList) mk(m, true);
  sec("Bright stars");
  for (const name of BRIGHT_STARS) {
    const d = document.createElement("div");
    d.className = "brow ind";
    d.textContent = "◦ " + name;
    d.dataset.star = name;
    d.addEventListener("click", () => selectStar(name));
    list.appendChild(d);
  }
  sec("Messier objects");
  for (const d0 of DSO) {
    const d = document.createElement("div");
    d.className = "brow ind";
    d.textContent = `◦ M${d0.m}${d0.name ? " " + d0.name : ""}`;
    d.dataset.dso = d0.m;
    d.addEventListener("click", () => selectDSO(d0.m));
    list.appendChild(d);
  }
}
function highlightBrowser() {
  document.querySelectorAll("#browserList .brow").forEach((d) => {
    d.classList.toggle("sel", !!state.selected && d.dataset.oid === state.selected.id);
  });
}

// star selection (pseudo-entry, not in objs)
let starSel = null;
const SP_WORD = { O: "blue giant", B: "blue-white", A: "white", F: "yellow-white", G: "yellow", K: "orange", M: "red" };
function fmtLy(ly) {
  if (ly == null || ly <= 0) return "—";
  if (ly < 95) return ly.toFixed(1) + " ly";
  if (ly < 9500) return (ly / 3.26156).toFixed(0) + " pc";
  return (ly / 3261.56).toFixed(1) + " kpc";
}
function selectStar(name) {
  stopTour();
  const rec = STAR_INFO.get(name);
  if (!rec) return;
  const pos = starPosByName.get(name);
  starSel = { name, pos, mag: rec.app, sp: rec.sp };
  state.selected = null;
  highlightBrowser();
  infoBody.innerHTML =
    `<h3>${name}</h3><div class=type>${SP_WORD[rec.sp] || ""} star</div>
     <div class=row><span>Magnitude</span><b>${rec.app.toFixed(2)}</b></div>
     <div class=row><span>Class</span><b>${rec.sp}</b></div>
     <div class=row><span>Distance</span><b>${fmtLy(rec.distLy)}</b></div>
     <div class=row><span>RA / Dec</span><b>${rec.ra.toFixed(2)}° / ${rec.dec.toFixed(2)}°</b></div>
     <p>Distant sun. Press Fly-to to travel there; Home returns to Earth.</p>
     <div class=btnrow><button data-act=fly>Fly to</button></div>`;
  infoEl.hidden = false;
  infoBody.querySelector("button").addEventListener("click", () => flyToPos(starSel.pos));
}
function flyToPos(pos, dist = 600) {
  state.anim = { t: 0, dur: 4.5, fromT: state.target.clone(), fromD: state.dist,
    toD: dist, live: { getPos: (out) => out.copy(pos), visR: 50 } };
  state.follow = null;
}

// search
const searchInput = $("searchInput"), searchHits = $("searchHits");
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  searchHits.innerHTML = "";
  if (q.length < 1) { searchHits.hidden = true; return; }
  const hits = [];
  for (const o of objs.values()) if (o.name.toLowerCase().includes(q)) hits.push({ t: "o", o });
  for (const name of STAR_INFO.keys()) {
    if (hits.length > 40) break;
    if (name.toLowerCase().includes(q)) hits.push({ t: "s", name });
  }
  for (const d of DSO) {
    if (hits.length > 60) break;
    if (("m" + d.m === q || (d.name && d.name.toLowerCase().includes(q)))) hits.push({ t: "d", d });
  }
  hits.slice(0, 12).forEach((hit) => {
    const d = document.createElement("div");
    if (hit.t === "o") d.textContent = hit.o.name;
    else if (hit.t === "s") d.textContent = hit.name + "  (star)";
    else d.textContent = `M${hit.d.m}${hit.d.name ? " " + hit.d.name : ""}  (DSO)`;
    d.addEventListener("click", () => {
      searchHits.hidden = true; searchInput.value = "";
      if (hit.t === "o") { selectObj(hit.o.id); gotoObj(hit.o); }
      else if (hit.t === "s") selectStar(hit.name);
      else selectDSO(hit.d.m);
    });
    searchHits.appendChild(d);
  });
  searchHits.hidden = !hits.length;
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = searchHits.firstChild;
    if (first) first.click();
  }
});

// ---------------- camera controls ----------------
let dragging = false, dragBtn = 0, lastX = 0, lastY = 0, movedPx = 0, pinchD = 0;
const cvs = renderer.domElement;
cvs.style.touchAction = "none";
cvs.addEventListener("pointerdown", (e) => {
  dragging = true; dragBtn = e.button; lastX = e.clientX; lastY = e.clientY; movedPx = 0;
  cvs.setPointerCapture(e.pointerId);
  stopTour();
});
cvs.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  movedPx += Math.abs(dx) + Math.abs(dy);
  if (dragBtn === 2 || e.shiftKey) {
    // pan: break follow
    state.follow = null; state.anim = null;
    const s = state.dist * 0.0011;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    state.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
  } else if (state.surface) {
    const s = state.surface;
    s.yaw -= dx * 0.004;
    s.pitch = Math.min(1.5, Math.max(-1.5, s.pitch - dy * 0.004));
    state.anim = null;
  } else {
    state.theta -= dx * 0.0052;
    state.phi = Math.min(Math.PI - 0.03, Math.max(0.03, state.phi - dy * 0.0052));
    state.anim = null;
    if (state.follow) { /* keep following, rotate offset */ }
  }
});
addEventListener("pointerup", () => { dragging = false; });
cvs.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (state.surface) return;
  if (e.deltaY > 0 && tryDiveToStreets()) return;
  stopTour();
  state.dist = clampDist(state.dist * Math.exp(e.deltaY * 0.0011));
  state.anim = null;
}, { passive: false });
cvs.addEventListener("contextmenu", (e) => e.preventDefault());
cvs.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinchD > 0) {
      if (d > pinchD && tryDiveToStreets()) { pinchD = d; return; }
      state.dist = clampDist(state.dist * Math.exp((pinchD - d) * 0.008));
    }
    pinchD = d;
  }
}, { passive: true });
cvs.addEventListener("touchend", () => { pinchD = 0; });

// click select
const ray = new THREE.Raycaster();
cvs.addEventListener("click", (e) => {
  if (movedPx > 6) return;
  const r = cvs.getBoundingClientRect();
  const nd = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(nd, camera);
  const hits = ray.intersectObjects(pickMeshes, false);
  if (hits.length) {
    const u = hits[0].object.userData;
    if (u.dso != null) selectDSO(u.dso);
    else if (u.oid) selectObj(u.oid);
  }
});
cvs.addEventListener("dblclick", (e) => {
  if (state.selected) gotoObj(state.selected);
});

function clampDist(d) { return Math.min(60000, Math.max(0.02, d)); }

function gotoObj(o, dur = 2.6) {
  stopTour();
  if (state.surface) exitSurface();
  const dest = o.getPos(new THREE.Vector3());
  const wantD = o.kind === "comet" ? 3 : Math.min(400, Math.max(o.visR * 14, o.visR + 0.35));
  state.anim = { t: 0, dur, fromT: state.target.clone(), fromD: state.dist,
    toD: wantD, live: o };
  state.follow = o;
  state.selected = o;
  selectObj(o.id);
  highlightBrowser();
}
function followObj(o) {
  stopTour();
  if (state.surface) exitSurface();
  state.follow = o; state.anim = null;
  state.selected = o; selectObj(o.id); highlightBrowser();
}
function goHome() {
  exitSurface();
  const e = objs.get("earth");
  selectObj("earth");
  gotoObj(e);
}

// ---------------- surface mode: stand on a world ----------------
const Y_AXIS = new THREE.Vector3(0, 1, 0);
function enterSurface(o) {
  if (state.surface && state.surface.body === o) return;
  stopTour();
  state.anim = null; state.follow = null;
  const bp = o.getPos(new THREE.Vector3());
  const dir = camera.position.clone().sub(bp);
  if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
  dir.normalize();
  state.surface = { body: o, dir, yaw: 0, pitch: 0.06,
    prev: { target: state.target.clone(), dist: state.dist, theta: state.theta, phi: state.phi } };
  // face the sun initially (if it is up)
  const s = state.surface;
  const east = new THREE.Vector3().crossVectors(Y_AXIS, s.dir);
  if (east.lengthSq() < 1e-4) east.set(1, 0, 0); else east.normalize();
  const north = new THREE.Vector3().crossVectors(s.dir, east).normalize();
  const toSun = bp.clone().negate().normalize();
  s.yaw = Math.atan2(toSun.dot(east), toSun.dot(north));
  camera.near = 0.001;
  camera.updateProjectionMatrix();
  orbitGroup.visible = false;
  beltGroup.visible = false;
  eqGroup.visible = false;
  state.selected = o;
  selectObj(o.id);
  highlightBrowser();
  $("surfCap").hidden = false;
}
function exitSurface() {
  if (!state.surface) return;
  const s = state.surface;
  state.surface = null;
  camera.near = 0.01;
  camera.updateProjectionMatrix();
  scene.background.set(0x02030a);
  for (const m of starMats) m.opacity = m.userData.baseOp;
  for (const m of skyLineMats) m.opacity = m.userData.baseOp;
  starGroup.children.forEach((c) => { if (c.isSprite) c.material.opacity = c.material.userData.baseOp ?? 0.5; });
  syncToggles();
  state.target.copy(s.prev.target);
  state.dist = s.prev.dist; state.theta = s.prev.theta; state.phi = s.prev.phi;
  $("surfCap").hidden = true;
}

addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  const k = e.key.toLowerCase();
  if (k === "escape" && isStreetOpen()) { closeStreetMap(); return; }
  if (k === "m") { openEarthStreets(); return; }
  if (k === "g" && state.selected) gotoObj(state.selected);
  else if (k === "f" && state.selected) followObj(state.selected);
  else if (k === "s") {
    if (state.surface) exitSurface();
    else if (state.selected && /^(planet|dwarf|moon|minor)$/.test(state.selected.kind)) enterSurface(state.selected);
  }
  else if (k === "escape") {
    if (state.surface) exitSurface();
    else { state.follow = null; state.anim = null; stopTour(); }
  }
  else if (k === "h") goHome();
  else if (k === "o") setToggle("orbits");
  else if (k === "l") setToggle("labels");
  else if (k === "c") setToggle("const");
  else if (k === "b") setToggle("bounds");
  else if (k === "d") setToggle("dso");
  else if (k === "arrowleft") { if (state.surface) state.surface.yaw += 0.12; else state.theta += 0.12; }
  else if (k === "arrowright") { if (state.surface) state.surface.yaw -= 0.12; else state.theta -= 0.12; }
  else if (k === "arrowup") {
    if (state.surface) state.surface.pitch = Math.min(1.5, state.surface.pitch + 0.1);
    else state.phi = Math.max(0.03, state.phi - 0.1);
  }
  else if (k === "arrowdown") {
    if (state.surface) state.surface.pitch = Math.max(-1.5, state.surface.pitch - 0.1);
    else state.phi = Math.min(Math.PI - 0.03, state.phi + 0.1);
  }
  else if (k === "+" || k === "=") state.dist = clampDist(state.dist * 0.85);
  else if (k === "-" || k === "_") state.dist = clampDist(state.dist * 1.18);
  else if (k === ".") warpStep(1);
  else if (k === ",") warpStep(-1);
  else if (k === " ") { e.preventDefault(); togglePause(); }
});

// ---------------- time ----------------
function warpStep(d) {
  state.warpIdx = Math.min(WARPS.length - 1, Math.max(0, state.warpIdx + d));
  state.paused = false;
  updateTimeUI();
}
function togglePause() { state.paused = !state.paused; updateTimeUI(); }
function updateTimeUI() {
  $("dateEl").textContent = jdToUTCString(state.jd);
  $("warpEl").textContent = state.paused ? "paused" : WARPS[state.warpIdx].label;
  $("pauseBtn").textContent = state.paused ? "▶" : "⏸";
}
$("slowerBtn").addEventListener("click", () => warpStep(-1));
$("fasterBtn").addEventListener("click", () => warpStep(1));
$("pauseBtn").addEventListener("click", togglePause);
$("nowBtn").addEventListener("click", () => { state.jd = dateToJD(new Date()); updateTimeUI(); });

// ---------------- toggles / panels ----------------
function setToggle(which) {
  if (which === "orbits") state.showOrbits = !state.showOrbits;
  if (which === "labels") state.showLabels = !state.showLabels;
  if (which === "const") state.showConst = !state.showConst;
  if (which === "grid") state.showGrid = !state.showGrid;
  if (which === "bounds") state.showBounds = !state.showBounds;
  if (which === "dso") state.showDSO = !state.showDSO;
  if (which === "belts") state.showBelts = !state.showBelts;
  if (which === "sats") { state.showSats = !state.showSats; setSatsVisible(state.showSats); }
  if (which === "events") { state.showEvents = !state.showEvents; setEventsVisible(state.showEvents); }
  syncToggles();
}
function syncToggles() {
  $("tglOrbits").classList.toggle("on", state.showOrbits);
  $("tglLabels").classList.toggle("on", state.showLabels);
  $("tglConst").classList.toggle("on", state.showConst);
  $("tglGrid").classList.toggle("on", state.showGrid);
  $("tglBounds").classList.toggle("on", state.showBounds);
  $("tglDso").classList.toggle("on", state.showDSO);
  $("tglBelts").classList.toggle("on", state.showBelts);
  $("tglSats").classList.toggle("on", state.showSats);
  $("tglEvents").classList.toggle("on", state.showEvents);
  orbitGroup.visible = state.showOrbits;
  constGroup.visible = state.showConst;
  boundGroup.visible = state.showBounds;
  dsoGroup.visible = state.showDSO;
  beltGroup.visible = state.showBelts;
  grid.visible = state.showGrid;
  eqGroup.visible = state.showGrid;
  for (const m of moonList) if (m.orbitLine) m.orbitLine.visible = state.showOrbits;
}
["orbits", "labels", "const", "grid", "bounds", "dso", "belts", "sats", "events"].forEach((k) => {
  $("tgl" + cap(k)).addEventListener("click", () => setToggle(k));
});
$("homeBtn").addEventListener("click", goHome);
$("tourBtn").addEventListener("click", () => (tourOn ? stopTour() : startTour()));
$("helpBtn").addEventListener("click", () => { $("helpOv").hidden = !$("helpOv").hidden; });
$("closeHelp").addEventListener("click", () => { $("helpOv").hidden = true; });
$("closeInfo").addEventListener("click", () => { infoEl.hidden = true; state.selected = null; highlightBrowser(); });
$("panelTgl").addEventListener("click", () => {
  if (innerWidth <= 760) document.body.classList.toggle("showleft");
  else document.body.classList.toggle("hidepanels");
});

// tour
const TOUR_IDS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
let tourTimer = null, tourOn = false, suppressStop = false;
function startTour() {
  stopTour();
  tourOn = true;
  $("tourBtn").classList.add("on");
  $("tourCap").hidden = false;
  let i = TOUR_IDS.indexOf(state.selected ? state.selected.id : "earth");
  const step = () => {
    if (!tourOn) return;
    i = (i + 1) % TOUR_IDS.length;
    const o = objs.get(TOUR_IDS[i]);
    suppressStop = true;
    gotoObj(o, 3.2);
    suppressStop = false;
    $("tourBtn").classList.add("on");
    $("tourCap").hidden = false;
    $("tourCap").textContent = `Tour: ${o.name} (${i + 1}/${TOUR_IDS.length}) — press Esc or drag to stop`;
    tourTimer = setTimeout(step, 6500);
  };
  step();
}
function stopTour() {
  if (suppressStop) return;
  tourOn = false;
  if (tourTimer) { clearTimeout(tourTimer); tourTimer = null; }
  const b = $("tourBtn"); if (b) b.classList.remove("on");
  const c = $("tourCap"); if (c) c.hidden = true;
}

// ---------------- per-frame ----------------
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), camOff = new THREE.Vector3();
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0, orbitT = 0;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  // time advance
  if (!state.paused) {
    state.jd += WARPS[state.warpIdx].dps * dt;
  }

  // goto animation
  if (state.anim) {
    const a = state.anim;
    a.t += dt;
    const k = easeIO(Math.min(1, a.t / a.dur));
    a.live.getPos(tmpV);
    state.target.lerpVectors(a.fromT, tmpV, k);
    state.dist = a.fromD + (a.toD - a.fromD) * k;
    if (a.t >= a.dur) state.anim = null;
  } else if (state.follow) {
    // translate camera with followed body
    state.follow.getPos(tmpV);
    tmpV2.copy(tmpV).sub(state.target);
    state.target.copy(tmpV);
  }

  // spin handled via rotation.y below from sim date
  const dNow = state.jd;

  // update body positions
  for (const o of objs.values()) {
    if (!o.getPos || !o.mesh) continue;
    o.getPos(tmpV);
    o.mesh.position.copy(tmpV);
    if (o.proxy) o.proxy.position.copy(tmpV);
    if (o.glow) o.glow.position.copy(tmpV);
    if (o.orbitLine) o.orbitLine.position.copy(tmpV);
    if ((o.kind === "planet" || o.kind === "dwarf") && o.rotDays) {
      o.mesh.rotation.y = ((dNow - 2451545.0) / o.rotDays) * Math.PI * 2;
    }
    if (o.kind === "comet") {
      const rAU = tmpV.length() / AU;
      const act = Math.min(1.4, Math.max(0, 1.8 / (rAU * rAU + 0.15) - 0.12));
      o.coma.position.copy(tmpV);
      o.coma.scale.setScalar(Math.max(0.12, o.visR * (1.5 + 6 * act)));
      o.coma.material.opacity = 0.10 + 0.45 * Math.min(1, act);
      const tp = o.tail.geometry.attributes.position.array;
      const hl = o.visR * (3 + 30 * act);
      tmpV2.copy(tmpV).divideScalar(tmpV.length() || 1);
      tp[0] = tmpV.x; tp[1] = tmpV.y; tp[2] = tmpV.z;
      tp[3] = tmpV.x + tmpV2.x * hl; tp[4] = tmpV.y + tmpV2.y * hl; tp[5] = tmpV.z + tmpV2.z * hl;
      o.tail.geometry.attributes.position.needsUpdate = true;
      o.tail.material.opacity = 0.12 + 0.45 * Math.min(1, act);
    }
  }

  // belts drift (differential rotation)
  if (state.showBelts && !state.paused) {
    const dDays = WARPS[state.warpIdx].dps * dt;
    for (const b of belts) {
      const arr = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < b.parts.length; i++) {
        const p = b.parts[i];
        p.a += p.sp * dDays;
        arr[i * 3] = Math.cos(p.a) * p.r; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = Math.sin(p.a) * p.r;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
    }
  }

  // HD Earth: sun direction, clouds drift (globe.gl / Cesium style)
  if (typeof earthHD !== "undefined") earthHD.update(dt);

  // live layers: SGP4 satellites (1 Hz) + event cache refresh
  try { updateSatellites(dNow); } catch (e) { /* sat lib still loading */ }
  try { updateEvents(); } catch (e) { /* noop */ }

  // camera: orbit mode or surface mode
  if (state.surface) {
    const s = state.surface;
    s.body.getPos(tmpV);
    const up = s.dir;
    const east = tmpV2.crossVectors(Y_AXIS, up);
    if (east.lengthSq() < 1e-4) east.set(1, 0, 0); else east.divideScalar(east.length());
    const north = new THREE.Vector3().crossVectors(up, east);
    const cp = Math.cos(s.pitch);
    const view = new THREE.Vector3()
      .addScaledVector(north, cp * Math.cos(s.yaw))
      .addScaledVector(east, cp * Math.sin(s.yaw))
      .addScaledVector(up, Math.sin(s.pitch));
    camera.position.copy(tmpV).addScaledVector(up, s.body.visR * 1.04);
    camera.lookAt(camera.position.clone().add(view));
    // sky brightness from sun elevation
    const toSun = tmpV2.copy(tmpV).negate().divideScalar(tmpV.length() || 1);
    const elev = toSun.dot(up);
    const hasAtmo = !!s.body.skyDay;
    const t = Math.min(1, Math.max(0, (elev + 0.08) / 0.30));
    const night = [0.008, 0.012, 0.039];
    let rC = night[0], gC = night[1], bC = night[2];
    if (hasAtmo) {
      const dusk = [0.45, 0.22, 0.10];
      const day = [s.body.skyDay.r, s.body.skyDay.g, s.body.skyDay.b];
      const mix2 = (a, b, k) => a + (b - a) * k;
      if (t < 0.5) {
        const k = t * 2;
        rC = mix2(night[0], dusk[0], k); gC = mix2(night[1], dusk[1], k); bC = mix2(night[2], dusk[2], k);
      } else {
        const k = (t - 0.5) * 2;
        rC = mix2(dusk[0], day[0], k); gC = mix2(dusk[1], day[1], k); bC = mix2(dusk[2], day[2], k);
      }
    }
    scene.background.setRGB(rC, gC, bC);
    const starF = hasAtmo ? 1 - Math.min(1, Math.max(0, elev / 0.12)) : 1;
    for (const m of starMats) m.opacity = m.userData.baseOp * starF;
    for (const m of skyLineMats) m.opacity = m.userData.baseOp * starF;
    window.__dayStarF = starF;
    starGroup.children.forEach((c) => { if (c.isSprite) c.material.opacity = (c.material.userData.baseOp ?? 0.5) * starF; });
    const sunEl = (elev * 57.2958).toFixed(0);
    $("surfCap").innerHTML = `Surface of <b>${s.body.name}</b> · Sun ${elev >= 0 ? "+" : ""}${sunEl}° ` +
      `<button id="orbitBtn">Orbit view (Esc)</button>` +
      (s.body.id === "earth" ? ` <button id="surfStreets">Streets 3D</button>` : "");
    const ob = $("orbitBtn");
    if (ob && !ob.dataset.wired) { ob.dataset.wired = "1"; ob.addEventListener("click", exitSurface); }
    const sb = $("surfStreets");
    if (sb && !sb.dataset.wired) { sb.dataset.wired = "1"; sb.addEventListener("click", openEarthStreets); }
  } else {
    camOff.setFromSphericalCoords(state.dist, state.phi, state.theta);
    camera.position.copy(state.target).add(camOff);
    camera.lookAt(state.target);
  }

  // orbit refresh (elements drift slowly)
  orbitT += dt;
  if (orbitT > 2) { orbitT = 0; rebuildOrbits(); }

  // labels
  for (const o of objs.values()) {
    if (!o.getPos || !o.mesh) continue;
    const cls = o.kind === "moon" ? "moon" : o.kind === "star-local" ? "sun"
      : o.kind === "comet" ? "comet" : (o.kind === "minor" || o.kind === "dwarf") ? "minor" : "planet";
    if (state.surface && state.surface.body === o) {
      placeLabel(o.id, cls, o.name, tmpV.set(0, -1e9, 0), 0, false);
      continue;
    }
    if (o.kind === "moon" && state.dist > 500 && o !== state.selected && o !== state.follow) {
      placeLabel(o.id, "moon", o.name, tmpV.set(0, -1e9, 0), 0, false);
      continue;
    }
    if (o.kind === "comet") {
      o.getPos(tmpV);
      const rAU = tmpV.length() / AU;
      if (rAU > 8 && o !== state.selected) {
        placeLabel(o.id, cls, o.name, tmpV.set(0, -1e9, 0), 0, false);
        continue;
      }
    } else {
      o.getPos(tmpV);
    }
    placeLabel(o.id, cls, o.name, tmpV, -6, state.showLabels);
  }
  // bright star labels + constellation names + DSO labels
  const dayF = state.surface ? (window.__dayStarF ?? 1) : 1;
  const skyLbl = state.showLabels && dayF > 0.25;
  for (const name of BRIGHT_STARS) {
    if (!skyLbl) { placeLabel("st:" + name, "star", name, tmpV.set(0, -1e9, 0), 0, false); continue; }
    const p = starPosByName.get(name);
    if (p) placeLabel("st:" + name, "star", name, p, -4, true);
  }
  for (const c of constCentroids) {
    placeLabel("c:" + c.name, "const", c.name, c.pos, -4, state.showConst && skyLbl);
  }
  if (state.showDSO && skyLbl) {
    for (const d of DSO_MAP.values()) {
      if (d.mag > 9.5) continue;
      placeLabel("dso:" + d.m, "dso", "M" + d.m, d.pos, -4, true);
    }
  } else {
    for (const d of DSO_MAP.values()) {
      if (d.mag > 9.5) continue;
      placeLabel("dso:" + d.m, "dso", "M" + d.m, tmpV.set(0, -1e9, 0), 0, false);
    }
  }

  // fps + time UI (throttled)
  fpsAcc += dt; fpsN++;
  if ((fpsT += dt) > 0.5) {
    $("fpsEl").textContent = `${Math.round(fpsN / fpsAcc)} fps · ${polycount()}`;
    fpsAcc = 0; fpsN = 0; fpsT = 0;
    updateTimeUI();
  }

  renderer.render(scene, camera);
}
function polycount() {
  let tris = 0;
  scene.traverse((o) => { if (o.isMesh) tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
  return tris > 1e6 ? (tris / 1e6).toFixed(1) + "M tris" : Math.round(tris / 1e3) + "k tris";
}

// ---------------- boot ----------------
resize();
syncToggles();
updateTimeUI();
{
  // start at Earth, following
  const e = objs.get("earth");
  e.getPos(tmpV);
  state.target.copy(tmpV);
  state.dist = 7;
  state.follow = e;
  selectObj("earth");
  highlightBrowser();
}
$("loadOv").hidden = true;
frame();

// test hooks
window.__celestia = { state, objs, WARPS, gotoObj, followObj, selectObj, selectStar, selectDSO,
  enterSurface, exitSurface, goHome, version: "1.2", satsStatus, satCount, issLatLon, eventsStatus,
  renderer, scene, camera, earthHD, openEarthStreets, isStreetOpen, streetDebug, tryDiveToStreets, streetZoomTo, streetMap };
