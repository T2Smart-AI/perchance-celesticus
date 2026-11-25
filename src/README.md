# Celestia Web (Perchance port)

Native WebGL re-implementation of Celestia-style space visualization.
The original Celestia is a C++/OpenGL desktop app and cannot run in a
browser directly; this port re-creates its core experience in Three.js:

- Sun + 8 planets + Pluto with **JPL approximate ephemerides** (J2000 + rates)
- 10 major moons on period-correct orbits
- ~90 bright stars at approximate J2000 positions + 5000 faint background stars
  with a galactic band, 23 constellation stick figures
- Celestia-style flight: drag-look, wheel zoom, right-drag pan,
  click-select, **G**oto, **F**ollow, **H**ome, time warp, guided grand tour
- Procedural planet textures (no external assets), Saturn/Uranus rings,
  orbit lines, ecliptic grid toggle, search, info panel with true readouts

## Files

- `index.html` — UI shell (top bar, browser, info, bottom bar, help)
- `src/celestia/main.js` — renderer + controls + UI wiring
- `src/celestia/astro.js` — Julian dates, Kepler solver, element propagation
- `src/celestia/data.js` — orbital elements, moons, star catalog, constellations
- `src/celestia/textures.js` — procedural canvas textures
- `src/celestia/earth.js` — HD Earth (day/night shader, glint, clouds, atmo)
- `src/celestia/satellites.js` — live SGP4 satellite layer (CelesTrak TLE)
- `src/celestia/events.js` — live quake/hazard overlays (USGS + EONET)

## Accuracy notes

- Planet positions use the JPL Keplerian approximate table, valid ~1800–2050.
  Good to arcminute-ish precision — fine for visualization.
- Bright-star RA/Dec are approximate J2000 (within ~1°); not for astrometry.
- Visual sizes and moon orbit radii are exaggerated (see help card);
  numeric readouts show true values.

## Data sources & attribution

- Star catalog (positions, magnitudes, spectral types, distances, names):
  `cosmonium/cosmonium-data` `stars.yaml` (Hipparcos-derived), processed to
  naked-eye subset. IAU constellation lines: `Stellarium/stellarium`
  `skycultures/modern/index.json` (HIP-identified); IAU boundaries from the
  same file (B1875, precessed to J2000 at build time).
- Messier catalog (positions, magnitudes, sizes): Stellarium
  `nebulae/default/catalog.txt`; common names: `names.dat`.
- Dwarf planets / large asteroids & comets (osculating elements, modern
  apparitions): Stellarium `data/ssystem_minor.ini` and
  `data/ssystem_1000comets.ini`, converted to J2000 mean-longitude form.
- Planet positions: JPL Keplerian approximate ephemerides (as before).
- Earth imagery: NASA Visible Earth — Blue Marble Next Generation (day),
  Black Marble (night lights), ETOPO-style elevation + ocean mask via the
  three-globe example imagery set (vasturiano/three-globe), clouds from
  turban/webgl-earth `fair_clouds_4k`. Rendering approach inspired by the
  globe.gl day-night-cycle custom shader (sun-direction day/night blend with
  soft twilight) and CesiumJS (ocean specular glint, terrain exaggeration,
  sun-aware atmosphere limb).
- Live satellites: CelesTrak GP element sets (`stations` + `visual` groups,
  TLE) propagated in-browser with SGP4 via satellite.js (shashwatak/
  satellite-js), loaded lazily from esm.sh. Technique adapted from satvis
  (Flowm/satvis: SGP4 + orbit-class coloring) and godseye's SatelliteLayer
  (twoline2satrec → propagate → eciToGeodetic, bundled fallback TLE).
  Positions are mapped through the Earth mesh matrix so tilt + spin match
  the texture. Points colored by orbit class (blue LEO, green MEO, gold
  GEO, salmon HEO, white stations) + white ISS orbit ribbon.
- Live events: USGS earthquake feed (2.5+/day GeoJSON, yellow→red by
  magnitude) + NASA EONET open events (storms, fires, volcanoes…,
  per-category colors). Endpoint catalog inspired by godseye's
  `dataSources.js`; only keyless CORS-open feeds used, 6 h refresh.
## Street-level 3D map (MapLibre + OpenFreeMap, no API key)

- Press **M** (or Earth's "Streets 3D" button, or the surface-mode button) to
  open an ultra-detailed street map: 3D-extruded buildings with real heights,
  street names/numbers, POIs, plus terrain relief — all from the free
  OpenFreeMap vector tiles (OpenStreetMap data), no signup or key.
- Toolbar: address search (free Nominatim geocoder), ⚄ City (random pick
  from the `streetCity` list in `main.pjs` — edit it to add your own places),
  ◉ Here (centers on where you stand / look on Earth, computed from the
  Earth's tilt + spin so it matches the visible texture).
- The library is lazy-loaded from the pinned jsDelivr CDN only on first open,
  so space-mode boot stays fast.
- Attributions (© OpenMapTiles © OpenStreetMap contributors) render in-map
  as required by the data licenses.
- Fully zoom-coupled: zooming all the way into Earth (wheel/pinch while it
  is followed or selected, or M / Streets 3D buttons) dives seamlessly from
  orbit onto a MapLibre **globe** that flies down to street level; zooming
  back out past zoom 2 fades smoothly back to the space view above that spot.
  Far = globe projection without terrain, streets = flat + terrain relief
  (globe + terrain together render black frames in MapLibre, so the map swaps
  modes around zoom 9 — invisible mid-gesture, deferred to moveend after
  scripted flights).
- Many thanks to the Cosmonium, Stellarium, and Celestia open-source projects.
- Live-layer techniques adapted from satvis (Flowm/satvis), godseye, and
  earth-view (NASA GIBS WMS provider pattern) — see data sources above.

## Testing

- `window.__celestia` exposes state/objs/goto/follow/select for eval-driven checks.
