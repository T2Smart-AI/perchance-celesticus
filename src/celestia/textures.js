// textures.js — procedural canvas textures (no external assets).
import * as THREE from "../../vendor/p2ga5t-three_0.160.0.js";

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}

// deterministic PRNG so textures are stable
function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let z = Math.imul(t ^ (t >>> 15), t | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function grain(ctx, w, h, rand, n, alpha, light, dark) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h;
    const r = 0.5 + rand() * 2.2;
    ctx.fillStyle = rand() < 0.5 ? light : dark;
    ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function bands(ctx, w, h, rand, palette, wobble = 6, count = 9) {
  let y = 0;
  for (let i = 0; i < count; i++) {
    const bh = h / count;
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillRect(0, y, w, bh + 1);
    // wavy edges
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let x = 0; x < w; x += 8) {
      const yy = y + Math.sin(x * 0.05 + i * 2.2) * wobble * rand();
      ctx.fillRect(x, yy, 8, 2);
    }
    y += bh;
  }
}

function craters(ctx, w, h, rand, n, maxR = 9) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = 1 + rand() * maxR;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.8, 0, 7); ctx.fill();
  }
}

export function planetTexture(kind, seed = 1) {
  const W = 512, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const rand = mulberry(seed * 7919 + 13);
  switch (kind) {
    case "mercury":
      ctx.fillStyle = "#8a7d72"; ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rand, 2600, 0.25, "#a89a8c", "#5f554c");
      craters(ctx, W, H, rand, 220, 7);
      break;
    case "venus":
      ctx.fillStyle = "#d9b96f"; ctx.fillRect(0, 0, W, H);
      bands(ctx, W, H, rand, ["#e6cc85", "#d9b96f", "#cfa95e", "#e2c179"], 9, 7);
      grain(ctx, W, H, rand, 900, 0.10, "#f2e2ac", "#b28f4e");
      break;
    case "earth": {
      ctx.fillStyle = "#1c4f9c"; ctx.fillRect(0, 0, W, H);
      // continents: blobs
      for (let i = 0; i < 14; i++) {
        const cx = rand() * W, cy = H * 0.12 + rand() * H * 0.76;
        ctx.fillStyle = i % 3 ? "#3e7a3a" : "#6b8f4e";
        for (let b = 0; b < 26; b++) {
          const x = cx + (rand() - 0.5) * 130, y = cy + (rand() - 0.5) * 70;
          const r = 6 + rand() * 20;
          ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.arc((x + W) % W, y, r, 0, 7); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      // ice caps
      ctx.fillStyle = "#e8f2fa"; ctx.fillRect(0, 0, W, 16); ctx.fillRect(0, H - 18, W, 18);
      // clouds
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 120; i++) {
        ctx.globalAlpha = 0.10 + rand() * 0.16;
        const x = rand() * W, y = rand() * H, w = 20 + rand() * 70, h = 3 + rand() * 8;
        ctx.beginPath(); ctx.ellipse(x, y, w, h, (rand() - 0.5) * 0.6, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "mars":
      ctx.fillStyle = "#b5562f"; ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rand, 2200, 0.22, "#d97f4e", "#7e3a22");
      craters(ctx, W, H, rand, 150, 8);
      ctx.fillStyle = "rgba(232,242,250,0.9)";
      ctx.fillRect(0, 0, W, 10); ctx.fillRect(0, H - 12, W, 12);
      ctx.fillStyle = "rgba(120,60,30,0.35)";
      ctx.fillRect(0, H * 0.52, W, H * 0.10);
      break;
    case "jupiter":
      bands(ctx, W, H, rand, ["#d8b48f", "#b98a5e", "#e8d3ae", "#a76f45", "#e0c096", "#8f5f3c"], 7, 12);
      grain(ctx, W, H, rand, 1500, 0.10, "#f4e6cc", "#7e5233");
      // red spot
      ctx.fillStyle = "#c1553b";
      ctx.beginPath(); ctx.ellipse(W * 0.68, H * 0.62, 46, 22, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#e07a55";
      ctx.beginPath(); ctx.ellipse(W * 0.68, H * 0.62, 30, 13, 0, 0, 7); ctx.fill();
      break;
    case "saturn":
      bands(ctx, W, H, rand, ["#e3cf9e", "#d3b982", "#efe0b4", "#c4a76f"], 5, 10);
      grain(ctx, W, H, rand, 900, 0.08, "#f6ecd0", "#a98f60");
      break;
    case "uranus":
      ctx.fillStyle = "#9fdbe0"; ctx.fillRect(0, 0, W, H);
      bands(ctx, W, H, rand, ["#9fdbe0", "#8fd0d6", "#ace4e8"], 4, 6);
      grain(ctx, W, H, rand, 500, 0.06, "#c8f0f2", "#79b8bd");
      break;
    case "neptune":
      ctx.fillStyle = "#3f62d8"; ctx.fillRect(0, 0, W, H);
      bands(ctx, W, H, rand, ["#4f6fe8", "#354fb8", "#5f7ff0", "#2c439c"], 6, 8);
      grain(ctx, W, H, rand, 800, 0.10, "#8fa4f2", "#1e3178");
      ctx.fillStyle = "rgba(20,30,80,0.8)";
      ctx.beginPath(); ctx.ellipse(W * 0.4, H * 0.45, 34, 18, 0, 0, 7); ctx.fill();
      break;
    case "pluto":
      ctx.fillStyle = "#b8a88e"; ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rand, 1700, 0.20, "#d8c8ac", "#7e6c58");
      ctx.fillStyle = "rgba(240,235,225,0.75)"; // heart glacier
      ctx.beginPath(); ctx.ellipse(W * 0.55, H * 0.55, 60, 44, 0.3, 0, 7); ctx.fill();
      break;
    case "moon":
      ctx.fillStyle = "#9a9a9a"; ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rand, 2400, 0.22, "#c4c4c4", "#6e6e6e");
      craters(ctx, W, H, rand, 260, 10);
      break;
    case "io":
      ctx.fillStyle = "#d8c85a"; ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rand, 1500, 0.25, "#f2e88a", "#8a7430");
      ctx.fillStyle = "rgba(180,60,20,0.5)";
      for (let i = 0; i < 24; i++) { ctx.beginPath(); ctx.arc(rand() * W, rand() * H, 2 + rand() * 6, 0, 7); ctx.fill(); }
      break;
    case "europa":
      ctx.fillStyle = "#cfc4b2"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(150,90,60,0.55)"; ctx.lineWidth = 1.4;
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        let x = rand() * W, y = rand() * H;
        ctx.moveTo(x, y);
        for (let s = 0; s < 5; s++) { x += (rand() - 0.5) * 90; y += (rand() - 0.5) * 40; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      break;
    case "ganymede":
      ctx.fillStyle = "#8d8272"; ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rand, 1800, 0.22, "#b5a88f", "#5e564a");
      craters(ctx, W, H, rand, 120, 6);
      break;
    case "callisto":
      ctx.fillStyle = "#6e675c"; ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rand, 1600, 0.25, "#968c7c", "#453f36");
      craters(ctx, W, H, rand, 300, 6);
      break;
    case "titan":
      ctx.fillStyle = "#c8923a"; ctx.fillRect(0, 0, W, H);
      bands(ctx, W, H, rand, ["#d8a848", "#c8923a", "#e0b45e"], 8, 5);
      grain(ctx, W, H, rand, 600, 0.08, "#e8c878", "#9a7028");
      break;
    case "triton":
      ctx.fillStyle = "#b8c8cc"; ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rand, 1200, 0.15, "#e0ecee", "#8a9a9e");
      break;
    case "rock":
      ctx.fillStyle = "#8a8478"; ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, rand, 2200, 0.25, "#aaa294", "#5e584c");
      craters(ctx, W, H, rand, 200, 8);
      break;
    default:
      ctx.fillStyle = "#888888"; ctx.fillRect(0, 0, W, H);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.55)"));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function ringTexture() {
  const [c, ctx] = makeCanvas(256, 8);
  const rand = mulberry(42);
  for (let x = 0; x < 256; x++) {
    const v = 120 + Math.floor(rand() * 120);
    const a = 40 + Math.floor(rand() * 180);
    ctx.fillStyle = `rgba(${v},${v - 10},${v - 30},${a / 255})`;
    if (x > 150 && x < 170) ctx.fillStyle = "rgba(0,0,0,0)"; // Cassini division
    ctx.fillRect(x, 0, 1, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
