// data.js — Solar System + bright-star catalog + constellation sticks.
//
// Star positions are approximate J2000 (RA/Dec in degrees, visual magnitude,
// spectral class). Good to ~1 deg — fine for visualization; not for astrometry.
// Faint background stars are generated procedurally at runtime.

// JPL Keplerian elements (J2000 + rates/century), approximate positions 1800–2050.
export const PLANETS = [
  { id: "mercury", name: "Mercury", a: 0.38709927, e: 0.20563593, I: 7.00497902, L: 252.25032350, lp: 77.45779628, node: 48.33076593, da: 0.00000037, de: 0.00001906, dI: -0.00594749, dL: 149472.67411175, dlp: 0.16047689, dnode: -0.12534081,
    radiusKm: 2439.7, color: "#9c8e84", tex: "mercury", tiltDeg: 0.03, rotDays: 58.646, periodStr: "88.0 days",
    desc: "Smallest planet; a cratered world racing around the Sun." },
  { id: "venus", name: "Venus", a: 0.72333566, e: 0.00677672, I: 3.39467605, L: 181.97909950, lp: 131.60246718, node: 76.67984255, da: 0.00000390, de: -0.00004107, dI: -0.00078890, dL: 58517.81538729, dlp: 0.00268329, dnode: -0.27769418,
    radiusKm: 6051.8, color: "#e8c97a", tex: "venus", tiltDeg: 177.4, rotDays: -243.025, periodStr: "224.7 days",
    desc: "Shrouded in CO2 and acid cloud; hottest surface of any planet." },
  { id: "earth", name: "Earth", a: 1.00000261, e: 0.01671123, I: -0.00001531, L: 100.46457166, lp: 102.93768193, node: 0.0, da: 0.00000562, de: -0.00004392, dI: -0.01294668, dL: 35999.37244981, dlp: 0.32327364, dnode: 0.0,
    radiusKm: 6371.0, color: "#4d7dd1", tex: "earth", tiltDeg: 23.44, rotDays: 0.997, periodStr: "365.25 days",
    desc: "Our home — Blue Marble day map, Black Marble city lights on the night side, real clouds, ocean sun glint and terrain relief." },
  { id: "mars", name: "Mars", a: 1.52371034, e: 0.09339410, I: 1.84969142, L: -4.55343205, lp: -23.94362959, node: 49.55953891, da: 0.00001847, de: 0.00007882, dI: -0.00813131, dL: 19140.30268499, dlp: 0.44441088, dnode: -0.29257343,
    radiusKm: 3389.5, color: "#d1603a", tex: "mars", tiltDeg: 25.19, rotDays: 1.026, periodStr: "687 days",
    desc: "The red planet: Olympus Mons, Valles Marineris, polar caps." },
  { id: "jupiter", name: "Jupiter", a: 5.20288700, e: 0.04838624, I: 1.30439695, L: 34.39644051, lp: 14.72847983, node: 100.47390909, da: -0.00011607, de: -0.00013253, dI: -0.00183714, dL: 3034.74612775, dlp: 0.21252668, dnode: 0.20469106,
    radiusKm: 69911, color: "#d8b48f", tex: "jupiter", tiltDeg: 3.13, rotDays: 0.414, periodStr: "11.86 years",
    desc: "Giant of the system; Great Red Spot storm wider than Earth." },
  { id: "saturn", name: "Saturn", a: 9.53667594, e: 0.05386179, I: 2.48599187, L: 49.95424423, lp: 92.59887831, node: 113.66242448, da: -0.00125060, de: -0.00050991, dI: 0.00193609, dL: 1222.49362201, dlp: -0.41897216, dnode: -0.28867794,
    radiusKm: 58232, color: "#e3cf9e", tex: "saturn", rings: true, tiltDeg: 26.73, rotDays: 0.444, periodStr: "29.45 years",
    desc: "Famous for its broad, icy ring system." },
  { id: "uranus", name: "Uranus", a: 19.18916464, e: 0.04725744, I: 0.77263783, L: 313.23810451, lp: 170.95527630, node: 74.01692503, da: -0.00196176, de: -0.00004397, dI: -0.00242939, dL: 428.48202785, dlp: 0.40805281, dnode: 0.04240589,
    radiusKm: 25362, color: "#9fe3e8", tex: "uranus", rings: "faint", tiltDeg: 97.77, rotDays: -0.718, periodStr: "84 years",
    desc: "Ice giant tipped on its side; methane gives the teal hue." },
  { id: "neptune", name: "Neptune", a: 30.06992276, e: 0.00859048, I: 1.77004347, L: -55.12002969, lp: 44.96476227, node: 131.78422574, da: 0.00026291, de: 0.00005105, dI: 0.00035372, dL: 218.45945325, dlp: -0.32241464, dnode: -0.00508664,
    radiusKm: 24622, color: "#4f6fe8", tex: "neptune", tiltDeg: 28.32, rotDays: 0.671, periodStr: "164.8 years",
    desc: "Windiest world; supersonic methane storms. Found by mathematics." },
  { id: "pluto", name: "Pluto", a: 39.482, e: 0.2488, I: 17.16, L: 238.929, lp: 224.068, node: 110.299, da: 0, de: 0, dI: 0, dL: 145.657, dlp: 0, dnode: 0,
    radiusKm: 1188.3, color: "#c8b49a", tex: "pluto", tiltDeg: 122.5, rotDays: 6.387, periodStr: "248 years", dwarf: true,
    desc: "Dwarf planet of the Kuiper belt; heart-shaped glacier of nitrogen ice." },
];

// Major moons: parent id, semi-major axis (10^3 km), period (days), radius km.
export const MOONS = [
  { id: "moon", name: "Moon", parent: "earth", a3km: 384.4, period: 27.3217, radiusKm: 1737.4, color: "#b8b8b8", tex: "moon", desc: "Earth's companion; stabilizes our seasons." },
  { id: "io", name: "Io", parent: "jupiter", a3km: 421.7, period: 1.769, radiusKm: 1821.6, color: "#e8d878", tex: "io", desc: "Most volcanic body known; kneaded by Jupiter's tides." },
  { id: "europa", name: "Europa", parent: "jupiter", a3km: 671.0, period: 3.551, radiusKm: 1560.8, color: "#d8cfc0", tex: "europa", desc: "Cracked ice shell over a global salty ocean." },
  { id: "ganymede", name: "Ganymede", parent: "jupiter", a3km: 1070.4, period: 7.155, radiusKm: 2634.1, color: "#9a8f80", tex: "ganymede", desc: "Largest moon in the solar system; has its own magnetic field." },
  { id: "callisto", name: "Callisto", parent: "jupiter", a3km: 1882.7, period: 16.689, radiusKm: 2410.3, color: "#7a7268", tex: "callisto", desc: "Ancient, densely cratered ice-rock world." },
  { id: "titan", name: "Titan", parent: "saturn", a3km: 1221.9, period: 15.945, radiusKm: 2574.7, color: "#d8a848", tex: "titan", desc: "Thick nitrogen haze; lakes and rain of liquid methane." },
  { id: "rhea", name: "Rhea", parent: "saturn", a3km: 527.1, period: 4.518, radiusKm: 764.3, color: "#b0aca4", tex: "moon", desc: "Icy moon with bright wispy streaks." },
  { id: "titania", name: "Titania", parent: "uranus", a3km: 435.9, period: 8.706, radiusKm: 788.9, color: "#a09a90", tex: "moon", desc: "Largest moon of Uranus; huge canyon systems." },
  { id: "triton", name: "Triton", parent: "neptune", a3km: 354.8, period: -5.877, radiusKm: 1353.4, color: "#c8d8dc", tex: "triton", desc: "Captured Kuiper object; nitrogen geysers, retrograde orbit." },
  { id: "charon", name: "Charon", parent: "pluto", a3km: 19.6, period: 6.387, radiusKm: 606, color: "#9a938a", tex: "moon", desc: "Pluto's binary partner; red polar cap of tholins." },
];

// name, RAdeg, Decdeg, Vmag, spectral class. Approx J2000.
export const STARS = [
  ["Sirius", 101.29, -16.72, -1.46, "A1"], ["Canopus", 95.99, -52.70, -0.74, "F0"],
  ["Arcturus", 213.92, 19.18, -0.05, "K1"], ["Vega", 279.23, 38.78, 0.03, "A0"],
  ["Capella", 79.17, 46.00, 0.08, "G5"], ["Rigel", 78.63, -8.20, 0.13, "B8"],
  ["Procyon", 114.83, 5.23, 0.34, "F5"], ["Betelgeuse", 88.79, 7.41, 0.50, "M2"],
  ["Achernar", 24.43, -57.24, 0.46, "B6"], ["Hadar", 210.96, -60.37, 0.61, "B1"],
  ["Altair", 297.70, 8.87, 0.76, "A7"], ["Acrux", 186.65, -63.10, 0.76, "B0"],
  ["Aldebaran", 68.98, 16.51, 0.85, "K5"], ["Antares", 247.35, -26.43, 0.96, "M1"],
  ["Spica", 201.30, -11.16, 0.97, "B1"], ["Pollux", 116.33, 28.03, 1.14, "K0"],
  ["Fomalhaut", 344.41, -29.62, 1.16, "A3"], ["Deneb", 310.36, 45.28, 1.25, "A2"],
  ["Mimosa", 191.93, -59.69, 1.25, "B0"], ["Regulus", 152.09, 11.97, 1.35, "B8"],
  ["Adhara", 104.66, -28.97, 1.50, "B2"], ["Castor", 113.65, 31.89, 1.58, "A1"],
  ["Gacrux", 187.79, -57.11, 1.63, "M4"], ["Shaula", 263.40, -37.10, 1.63, "B1"],
  ["Bellatrix", 81.28, 6.35, 1.64, "B2"], ["Alnath", 82.06, 28.61, 1.68, "B7"],
  ["Alnilam", 84.05, -1.20, 1.69, "B0"], ["Alnair", 335.68, -46.96, 1.74, "B6"],
  ["Alioth", 193.51, 55.96, 1.77, "A1"], ["Alnitak", 85.19, -1.94, 1.77, "O9"],
  ["Dubhe", 165.93, 61.75, 1.79, "K0"], ["Mirfak", 51.08, 44.86, 1.80, "F5"],
  ["Wezen", 105.16, -28.22, 1.83, "F8"], ["Sargas", 264.33, -34.29, 1.86, "F1"],
  ["Alkaid", 206.89, 49.31, 1.86, "B3"], ["Menkalinan", 90.03, 44.95, 1.90, "A2"],
  ["Alhena", 99.43, 16.40, 1.92, "A0"], ["Polaris", 37.95, 89.26, 1.98, "F7"],
  ["Mirzam", 95.67, -17.96, 1.98, "B1"], ["Nunki", 283.82, -26.30, 2.05, "B2"],
  ["Mirach", 19.81, 35.62, 2.06, "M0"], ["Algieba", 154.99, 19.84, 2.08, "K0"],
  ["Kochab", 222.68, 74.16, 2.08, "K4"], ["Saiph", 86.94, -9.67, 2.09, "B0"],
  ["Algol", 47.04, 40.96, 2.09, "B8"], ["Denebola", 177.27, 14.57, 2.11, "A3"],
  ["Sadr", 306.41, 40.26, 2.20, "F8"], ["Mintaka", 83.00, -0.30, 2.23, "B0"],
  ["Schedar", 10.13, 56.54, 2.24, "K0"], ["Almach", 30.97, 42.33, 2.26, "B8"],
  ["Mizar", 200.98, 54.93, 2.27, "A2"], ["Caph", 2.29, 59.15, 2.27, "F2"],
  ["Dschubba", 240.08, -22.62, 2.29, "B0"], ["Merak", 165.46, 56.38, 2.37, "A0"],
  ["Alcyone", 86.75, 24.12, 2.87, "B7"], ["Albireo", 292.68, 27.96, 3.18, "K3"],
  ["Phecda", 178.46, 53.69, 2.44, "A0"], ["Aludra", 111.02, -29.30, 2.45, "B5"],
  ["GienahCyg", 311.55, 33.96, 2.46, "K0"], ["GammaCas", 14.18, 60.72, 2.47, "B0"],
  ["Markab", 346.19, 15.21, 2.48, "B9"], ["DeltaCru", 183.95, -58.75, 2.79, "B2"],
  ["Ruchbah", 20.67, 60.24, 2.68, "A5"], ["Lesath", 258.75, -37.10, 2.69, "B2"],
  ["Tarazed", 296.22, 10.61, 2.72, "K3"], ["Porrima", 192.93, -1.45, 2.74, "F0"],
  ["Zubenesch", 229.85, -9.38, 2.61, "B8"], ["Zubenelg", 222.72, -16.04, 2.75, "A3"],
  ["Acrab", 244.36, -19.81, 2.62, "B0"], ["ThetaAur", 89.93, 37.21, 2.65, "A0"],
  ["Cursa", 77.25, -5.09, 2.78, "B1"], ["DeltaCyg", 296.69, 45.13, 2.87, "B9"],
  ["Muphrid", 208.67, 18.40, 2.68, "G0"], ["Izar", 220.55, 27.07, 2.37, "K0"],
  ["Scheat", 345.05, 28.08, 2.42, "M2"], ["Alpheratz", 2.10, 29.09, 2.07, "B8"],
  ["Algenib", 3.31, 15.18, 2.84, "B2"], ["Segin", 28.66, 63.67, 3.38, "B3"],
  ["Pherkad", 230.18, 71.83, 3.05, "A3"], ["Yildun", 260.73, 86.59, 4.36, "A1"],
  ["Megrez", 183.86, 57.03, 3.31, "A3"], ["Meissa", 83.78, 9.93, 3.33, "O8"],
  ["Wasat", 110.36, 21.98, 3.53, "F0"], ["Mebsuta", 96.06, 25.13, 3.06, "G8"],
  ["Zosma", 168.53, 20.52, 2.56, "A4"], ["Chertan", 173.65, 15.43, 3.32, "A2"],
  ["Sheliak", 282.73, 33.36, 3.52, "B8"], ["Sulafat", 287.44, 32.69, 3.25, "B9"],
  ["Alshain", 299.58, 6.41, 3.71, "G8"], ["KausAus", 276.04, -34.38, 1.85, "B9"],
  ["RigilKent", 219.90, -60.83, -0.27, "G2"], ["Gomeisa", 110.33, 8.29, 2.89, "B8"],
];

// Constellation stick figures: pairs of star names from STARS.
export const CONSTELLATIONS = [
  { name: "Orion", lines: [["Betelgeuse", "Alnitak"], ["Bellatrix", "Mintaka"], ["Alnitak", "Alnilam"], ["Alnilam", "Mintaka"], ["Alnitak", "Saiph"], ["Mintaka", "Rigel"], ["Saiph", "Rigel"]] },
  { name: "Ursa Major", lines: [["Dubhe", "Merak"], ["Merak", "Phecda"], ["Phecda", "Megrez"], ["Megrez", "Dubhe"], ["Megrez", "Alioth"], ["Alioth", "Mizar"], ["Mizar", "Alkaid"]] },
  { name: "Ursa Minor", lines: [["Polaris", "Yildun"], ["Yildun", "Pherkad"], ["Pherkad", "Kochab"]] },
  { name: "Cassiopeia", lines: [["Caph", "Schedar"], ["Schedar", "GammaCas"], ["GammaCas", "Ruchbah"], ["Ruchbah", "Segin"]] },
  { name: "Cygnus", lines: [["Deneb", "Sadr"], ["Sadr", "Albireo"], ["DeltaCyg", "Sadr"], ["DeltaCyg", "Deneb"], ["Sadr", "GienahCyg"]] },
  { name: "Lyra", lines: [["Vega", "Sheliak"], ["Vega", "Sulafat"], ["Sheliak", "Sulafat"]] },
  { name: "Aquila", lines: [["Tarazed", "Altair"], ["Altair", "Alshain"]] },
  { name: "Scorpius", lines: [["Dschubba", "Acrab"], ["Acrab", "Antares"], ["Antares", "Lesath"], ["Lesath", "Shaula"], ["Shaula", "Sargas"]] },
  { name: "Crux", lines: [["Acrux", "Gacrux"], ["Mimosa", "DeltaCru"]] },
  { name: "Gemini", lines: [["Castor", "Pollux"], ["Castor", "Wasat"], ["Pollux", "Wasat"], ["Wasat", "Alhena"], ["Pollux", "Mebsuta"]] },
  { name: "Leo", lines: [["Regulus", "Algieba"], ["Algieba", "Zosma"], ["Zosma", "Denebola"], ["Denebola", "Chertan"], ["Chertan", "Regulus"]] },
  { name: "Taurus", lines: [["Aldebaran", "Alcyone"], ["Alcyone", "Alnath"]] },
  { name: "Auriga", lines: [["Capella", "Menkalinan"], ["Menkalinan", "ThetaAur"], ["ThetaAur", "Alnath"], ["Alnath", "Capella"]] },
  { name: "Bootes", lines: [["Arcturus", "Muphrid"], ["Muphrid", "Izar"], ["Izar", "Arcturus"]] },
  { name: "Canis Major", lines: [["Sirius", "Mirzam"], ["Sirius", "Wezen"], ["Mirzam", "Adhara"], ["Wezen", "Adhara"], ["Adhara", "Aludra"]] },
  { name: "Pegasus", lines: [["Markab", "Scheat"], ["Scheat", "Alpheratz"], ["Alpheratz", "Algenib"], ["Algenib", "Markab"]] },
  { name: "Andromeda", lines: [["Alpheratz", "Mirach"], ["Mirach", "Almach"]] },
  { name: "Perseus", lines: [["Mirfak", "Algol"]] },
  { name: "Sagittarius", lines: [["KausAus", "Nunki"]] },
  { name: "Grus", lines: [["Alnair", "Fomalhaut"]] },
  { name: "Centaurus", lines: [["Hadar", "RigilKent"]] },
  { name: "Virgo", lines: [["Spica", "Porrima"]] },
  { name: "Eridanus", lines: [["Achernar", "Cursa"], ["Cursa", "Saiph"]] },
];

export function spectralColor(sp) {
  const c = (sp || "G")[0];
  switch (c) {
    case "O": return [0.70, 0.80, 1.0];
    case "B": return [0.78, 0.86, 1.0];
    case "A": return [0.92, 0.93, 1.0];
    case "F": return [1.0, 0.96, 0.86];
    case "G": return [1.0, 0.90, 0.72];
    case "K": return [1.0, 0.78, 0.58];
    case "M": return [1.0, 0.62, 0.45];
    default: return [1, 1, 1];
  }
}
