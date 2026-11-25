// astro.js — Julian dates + Keplerian (JPL approximate) heliocentric positions.
// Elements: J2000 + rates per century (valid ~1800–2050), EM Bary excluded.

export const AU_KM = 149597870.7;
export const DAY_MS = 86400000;

export function dateToJD(date) {
  return date.getTime() / DAY_MS + 2440587.5;
}

export function jdToDate(jd) {
  return new Date((jd - 2440587.5) * DAY_MS);
}

export function jdToUTCString(jd) {
  const d = jdToDate(jd);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

const D2R = Math.PI / 180;

function norm360(x) {
  x %= 360;
  return x < 0 ? x + 360 : x;
}

// Solve Kepler E - e*sinE = M (radians). Returns E.
export function solveKepler(M, e) {
  M = M % (2 * Math.PI);
  if (M < -Math.PI) M += 2 * Math.PI;
  if (M > Math.PI) M -= 2 * Math.PI;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
  }
  return E;
}

// el: {a, e, I, L, lp, node, da, de, dI, dL, dlp, dnode} (a in AU, angles deg, rates /century)
// Returns heliocentric ecliptic J2000 rectangular coords in AU.
export function planetEcliptic(el, jd) {
  const T = (jd - 2451545.0) / 36525;
  const a = el.a + el.da * T;
  const e = el.e + el.de * T;
  const I = (el.I + el.dI * T) * D2R;
  const L = norm360(el.L + el.dL * T);
  const lp = norm360(el.lp + el.dlp * T);
  const node = norm360(el.node + (el.dnode || 0) * T);
  const M = norm360(L - lp) * D2R;
  const w = (lp - node) * D2R; // argument of perihelion
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  // rotate by w (in plane), then I about x-axis, then node about z-axis
  const cw = Math.cos(w), sw = Math.sin(w);
  const xw = cw * xp - sw * yp;
  const yw = sw * xp + cw * yp;
  const cI = Math.cos(I), sI = Math.sin(I);
  const x1 = xw, y1 = cI * yw, z1 = sI * yw;
  const cn = Math.cos(node * D2R), sn = Math.sin(node * D2R);
  return {
    x: cn * x1 - sn * y1,
    y: sn * x1 + cn * y1,
    z: z1,
    a, e,
  };
}

// Sample a full orbit ellipse (ecliptic AU) for drawing. n points.
export function orbitSamples(el, jd, n = 180) {
  const T = (jd - 2451545.0) / 36525;
  const a = el.a + el.da * T;
  const e = el.e + el.de * T;
  const I = (el.I + el.dI * T) * D2R;
  const lp = norm360(el.lp + el.dlp * T);
  const node = norm360(el.node + (el.dnode || 0) * T);
  const w = (lp - node) * D2R;
  const cw = Math.cos(w), sw = Math.sin(w);
  const cI = Math.cos(I), sI = Math.sin(I);
  const cn = Math.cos(node * D2R), sn = Math.sin(node * D2R);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const E = (i / n) * 2 * Math.PI;
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const xw = cw * xp - sw * yp;
    const yw = sw * xp + cw * yp;
    const x1 = xw, y1 = cI * yw, z1 = sI * yw;
    pts.push([cn * x1 - sn * y1, sn * x1 + cn * y1, z1]);
  }
  return pts;
}

// RA/Dec (deg) -> unit vector in equatorial J2000.
export function radecToVec(raDeg, decDeg) {
  const ra = raDeg * D2R, dec = decDeg * D2R;
  return [
    Math.cos(dec) * Math.cos(ra),
    Math.sin(dec),
    Math.cos(dec) * Math.sin(ra),
  ];
}

// Equatorial unit vector -> ecliptic unit vector (rotate by obliquity eps).
export function eqToEcl([x, y, z]) {
  const eps = 23.43928 * D2R;
  const ce = Math.cos(eps), se = Math.sin(eps);
  return [x, ce * y + se * z, -se * y + ce * z];
}
