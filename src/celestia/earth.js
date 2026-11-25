// earth.js — globe.gl / Cesium-inspired high-detail Earth for Celestia Web.
// Techniques borrowed (re-implemented, no dependency):
//  - globe.gl three-globe: Blue Marble day map + topology bump + water
//    specular mask + separate rotating transparent clouds shell.
//  - globe.gl day-night-cycle example: custom shader mixing day/night
//    textures by sun direction with a soft twilight terminator.
//  - CesiumJS: sun-driven day/night blending, ocean sun glint (Blinn-Phong
//    masked to water), terrain displacement exaggeration, night-side city
//    lights (Black Marble), fresnel atmosphere rim that dims on the night
//    side, high-anisotropy mipmapped imagery.
//
// Data (NASA Visible Earth, public domain; processed crops served locally):
//  - src/celestia/textures/earth-day.jpg      Blue Marble Next Generation
//  - src/celestia/textures/earth-night.jpg    Black Marble city lights
//  - src/celestia/textures/earth-topology.png ETOPO-style elevation (bump+displacement)
//  - src/celestia/textures/earth-water.png    ocean mask (white=water, for sun glint)
//  - src/celestia/textures/earth-clouds.png   cloud layer (from webgl-earth fair_clouds)
import * as THREE from "../../vendor/p2ga5t-three_0.160.0.js";

const TEX = {
  day: "src/celestia/textures/earth-day.jpg",
  night: "src/celestia/textures/earth-night.jpg",
  bump: "src/celestia/textures/earth-topology.png",
  spec: "src/celestia/textures/earth-water.png",
  clouds: "src/celestia/textures/earth-clouds.png",
};

export function initEarthHD(earth, scene, renderer) {
  const visR = earth.visR;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // 1) Higher-tessellation sphere so displacement + terminator stay smooth.
  earth.mesh.geometry.dispose();
  earth.mesh.geometry = new THREE.SphereGeometry(visR, 96, 64);

  // Keep the procedural canvas as day fallback until HD arrives.
  const fallbackDay = earth.mesh.material.map || null;

  const uniforms = {
    dayMap: { value: fallbackDay },
    nightMap: { value: fallbackDay },
    bumpMap: { value: null },
    specMap: { value: null },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    dispScale: { value: visR * 0.014 },
    bumpStrength: { value: 0.6 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform sampler2D bumpMap;
      uniform float dispScale;
      varying vec2 vUv;
      varying vec3 vNW;
      varying vec3 vWP;
      void main() {
        vUv = uv;
        float h = 0.0;
        // vertex texture fetch (WebGL2) — real terrain relief, exaggerated
        h = texture2D(bumpMap, uv).r;
        vec3 p = position + normal * (h * dispScale);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWP = wp.xyz;
        vNW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D dayMap, nightMap, specMap;
      uniform vec3 sunDir;
      uniform float bumpStrength;
      varying vec2 vUv;
      varying vec3 vNW;
      varying vec3 vWP;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vNW);
        vec3 V = normalize(cameraPosition - vWP);
        vec3 S = normalize(sunDir);
        float ndl = dot(N, S);
        // Cesium-style soft terminator with a warm twilight band
        float dayMix = smoothstep(-0.12, 0.35, ndl);
        float dusk = smoothstep(-0.12, 0.02, ndl) * (1.0 - smoothstep(0.02, 0.42, ndl));
        vec3 dayCol = texture2D(dayMap, vUv).rgb;
        dayCol = mix(dayCol, dayCol * vec3(1.12, 0.62, 0.42), dusk * 0.65);
        vec3 nightCol = texture2D(nightMap, vUv).rgb * 1.25;
        // ocean sun glint, masked to water (spec texture: white = water).
        // sharpen the low-res mask so coasts/land stay matte, tight
        // Blinn-Phong lobe like Cesium's ocean specular.
        float water = smoothstep(0.45, 0.65, texture2D(specMap, vUv).r);
        vec3 H = normalize(S + V);
        float spec = pow(max(dot(N, H), 0.0), 160.0) * water * dayMix;
        vec3 dayLit = dayCol * (0.04 + 0.96 * dayMix) + vec3(1.0, 0.97, 0.9) * spec * 0.22;
        vec3 col = mix(nightCol + dayCol * 0.015, dayLit, dayMix);
        // fresnel atmosphere rim baked into limb (outer shell adds more)
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
        col += vec3(0.30, 0.55, 1.0) * fres * (0.12 + 0.88 * dayMix) * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  // bumpMap sampler must exist before first compile (use 1px black until loaded)
  {
    const px = new Uint8Array([0, 0, 0, 255]);
    const t = new THREE.DataTexture(px, 1, 1);
    t.needsUpdate = true;
    uniforms.bumpMap.value = t;
    const pxw = new Uint8Array([0, 0, 0, 255]);
    const tw = new THREE.DataTexture(pxw, 1, 1);
    tw.needsUpdate = true;
    uniforms.specMap.value = tw;
  }
  if (fallbackDay) {
    uniforms.nightMap.value = fallbackDay;
    mat.needsUpdate = true;
  }
  earth.mesh.material.dispose();
  earth.mesh.material = mat;
  earth.hd = { loaded: false };

  // 2) Async HD texture loads (lazy: no impact on initial boot).
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const load = (url, srgb) => new Promise((resolve) => {
    loader.load(url, (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      t.wrapS = THREE.RepeatWrapping;
      resolve(t);
    }, undefined, () => resolve(null));
  });
  Promise.all([load(TEX.day, true), load(TEX.night, true), load(TEX.bump, false), load(TEX.spec, false)])
    .then(([day, night, bump, spec]) => {
      if (day) uniforms.dayMap.value = day;
      if (night) uniforms.nightMap.value = night;
      if (bump) {
        bump.wrapS = THREE.RepeatWrapping;
        uniforms.bumpMap.value = bump;
      }
      if (spec) uniforms.specMap.value = spec;
      earth.hd.loaded = !!(day && night);
      earth.hd.day = !!day; earth.hd.night = !!night;
    });

  // 3) Clouds shell (globe.gl style): independent slow rotation, sun-lit.
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(visR * 1.014, 64, 48),
    new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.0, depthWrite: false })
  );
  clouds.renderOrder = 2;
  earth.mesh.add(clouds);
  earth.clouds = clouds;
  load(TEX.clouds, true).then((t) => {
    if (!t) return;
    clouds.material.map = t;
    clouds.material.opacity = 0.78;
    clouds.material.needsUpdate = true;
    earth.hd.clouds = true;
  });

  // 4) Upgrade the fresnel atmosphere shell to be sun-aware (Cesium-like:
  //    bright blue limb on the day side, faint on the night side).
  earth.mesh.children.forEach((child) => {
    if (child === clouds || !child.material || !child.material.isShaderMaterial) return;
    const u = child.material.uniforms;
    if (!u || !u.c || !u.p) return;
    child.material.vertexShader =
      "#include <common>\n" +
      "#include <logdepthbuf_pars_vertex>\n" +
      "varying vec3 vN; varying vec3 vNW;\n" +
      "void main(){ vN = normalize(normalMatrix * normal);\n" +
      " vNW = normalize(mat3(modelMatrix) * normal);\n" +
      " gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n" +
      " #include <logdepthbuf_vertex>\n" +
      " }";
    child.material.fragmentShader =
      "#include <logdepthbuf_pars_fragment>\n" +
      "uniform vec3 c; uniform float p; uniform vec3 sunDir;\n" +
      "varying vec3 vN; varying vec3 vNW;\n" +
      "void main(){\n" +
      " #include <logdepthbuf_fragment>\n" +
      " float rim = pow(max(0.0, 0.70 - dot(vN, vec3(0.0, 0.0, 1.0))), p);\n" +
      " float day = smoothstep(-0.35, 0.45, dot(normalize(vNW), normalize(sunDir)));\n" +
      " vec3 tint = mix(vec3(0.10, 0.18, 0.55), c, 0.25 + 0.75 * day);\n" +
      " gl_FragColor = vec4(tint, 1.0) * rim * (0.35 + 0.65 * day); }";
    child.material.uniforms.sunDir = uniforms.sunDir;
    child.material.needsUpdate = true;
  });

  const sunDir = uniforms.sunDir.value;
  const ePos = new THREE.Vector3();
  return {
    update(dt) {
      // sun direction at Earth (sun sits at origin)
      earth.getPos(ePos);
      if (ePos.lengthSq() > 1e-12) sunDir.copy(ePos).negate().normalize();
      if (clouds.material.map) clouds.rotation.y += dt * 0.0045;
    },
  };
}
