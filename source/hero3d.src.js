// hero3d.src.js — 3D-телефон для главного экрана Clip4K.
// Сборка: npx esbuild hero3d.src.js --bundle --minify --format=esm --target=es2020,safari15,chrome90,firefox90,edge90 --outfile=../site/hero3d.js
//
// Что делает:
//  - объёмный телефон (Three.js), поворачивается за мышью, на телефоне за наклоном (гироскоп);
//  - на экране играет ролик: hero.mp4 рядом с index.html, если он есть, иначе нарисованный город;
//  - «скан»: сверху вниз идёт линия, выше неё картинка резкая, ниже «мыло» с блоками сжатия;
//  - клик или тап по телефону запускает скан заново;
//  - при прокрутке телефон доворачивается; рендер стоит на паузе, когда главного экрана не видно.

import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Shape, ExtrudeGeometry, PlaneGeometry, BoxGeometry,
  Mesh, MeshPhysicalMaterial, ShapeGeometry, ShaderMaterial, CanvasTexture, PointLight, PMREMGenerator,
  LinearFilter, SRGBColorSpace, ACESFilmicToneMapping, MathUtils
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const TW = 540, TH = 1162;                // размер текстуры экрана = пропорции экрана телефона (без обрезки)
const BODY_W = 1.0, BODY_H = 2.06, BODY_R = 0.15, DEPTH = 0.06, BEVEL = 0.03;
const SCR_W = 0.92, SCR_H = 1.98;

// ---------- Картинка на экране ----------
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

function buildCity() {
  const c = document.createElement("canvas"); c.width = TW; c.height = TH;
  const x = c.getContext("2d");
  const sky = x.createLinearGradient(0, 0, 0, TH * 0.72);
  sky.addColorStop(0, "#07051a"); sky.addColorStop(0.55, "#2a0b3d"); sky.addColorStop(1, "#7a1648");
  x.fillStyle = sky; x.fillRect(0, 0, TW, TH);
  const r = rng(7);
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; x.fillRect(r() * TW, r() * TH * 0.4, 1.2, 1.2); }
  const layer = (n, minH, maxH, base, win, alpha) => {
    let px = -20;
    while (px < TW) {
      const w = 40 + r() * n, h = minH + r() * (maxH - minH), top = TH * 0.74 - h;
      x.fillStyle = base; x.fillRect(px, top, w, h + 400);
      for (let wy = top + 8; wy < TH * 0.74; wy += win + 4)
        for (let wx = px + 5; wx < px + w - win; wx += win + 3)
          if (r() > 0.45) { x.fillStyle = r() > 0.85 ? `rgba(37,244,238,${alpha})` : r() > 0.8 ? `rgba(254,44,85,${alpha})` : `rgba(255,214,140,${alpha * (0.5 + r() * 0.5)})`; x.fillRect(wx, wy, win, win + 1); }
      px += w + 2 + r() * 6;
    }
  };
  layer(40, 180, 380, "#120a22", 2, 0.55);
  layer(70, 120, 300, "#0b0716", 4, 0.85);
  // вертикальная неоновая вывеска
  x.save(); x.translate(TW * 0.2, TH * 0.36);
  x.fillStyle = "#05040b"; x.fillRect(-22, -10, 44, 190);
  x.font = "800 34px Unbounded, Arial Black, sans-serif"; x.textAlign = "center";
  x.shadowColor = "#25F4EE"; x.shadowBlur = 14; x.fillStyle = "#c9fffd";
  ["4", "K"].forEach((ch, i) => x.fillText(ch, 0, 34 + i * 40));
  x.shadowColor = "#FE2C55"; x.fillStyle = "#ffd3dc"; x.font = "800 20px Unbounded, Arial Black, sans-serif";
  ["1", "2", "0"].forEach((ch, i) => x.fillText(ch, 0, 114 + i * 22));
  x.restore();
  // дорога
  const road = x.createLinearGradient(0, TH * 0.74, 0, TH);
  road.addColorStop(0, "#14081f"); road.addColorStop(1, "#000");
  x.fillStyle = road; x.fillRect(0, TH * 0.74, TW, TH * 0.26);
  x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 1;
  for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(TW / 2 + i * 8, TH * 0.74); x.lineTo(TW / 2 + i * 70, TH); x.stroke(); }
  return c;
}

function heart(x, cx, cy, s) {
  x.beginPath(); x.moveTo(cx, cy + s * 0.35);
  x.bezierCurveTo(cx - s, cy - s * 0.3, cx - s * 0.45, cy - s, cx, cy - s * 0.45);
  x.bezierCurveTo(cx + s * 0.45, cy - s, cx + s, cy - s * 0.3, cx, cy + s * 0.35); x.fill();
}

function makeScreen() {
  const c = document.createElement("canvas"); c.width = TW; c.height = TH;
  const x = c.getContext("2d");
  const city = buildCity();
  const r = rng(42);
  const cars = Array.from({ length: 14 }, () => ({ y: TH * (0.76 + r() * 0.22), v: 60 + r() * 220, p: r() * TW, len: 30 + r() * 90, col: r() > 0.5 ? "#25F4EE" : "#FE2C55", dir: r() > 0.5 ? 1 : -1 }));
  let video = null;

  const v = document.createElement("video");
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", "");
  v.src = new URL("hero.mp4", document.baseURI).href;
  v.addEventListener("loadeddata", () => { video = v; v.play().catch(() => {}); }, { once: true });
  v.addEventListener("error", () => { video = null; }, { once: true });

  function drawUi(t) {
    // интерфейс ленты: мелкие детали хорошо показывают разницу «мыло / резко»
    const g = x.createLinearGradient(0, TH * 0.62, 0, TH);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.65)");
    x.fillStyle = g; x.fillRect(0, TH * 0.62, TW, TH * 0.38);
    x.fillStyle = "#fff"; x.font = "700 22px Manrope, Arial, sans-serif"; x.textAlign = "left";
    x.fillText("@clip4k", 22, TH - 120);
    x.font = "500 17px Manrope, Arial, sans-serif"; x.fillStyle = "rgba(255,255,255,.92)";
    x.fillText("Night drive, shot in 4K at 120 fps", 22, TH - 92);
    x.fillText("#4k #120fps #nightcity", 22, TH - 68);
    x.font = "600 14px Manrope, Arial, sans-serif"; x.fillStyle = "rgba(255,255,255,.75)";
    x.fillText("♫  original sound", 22, TH - 40);
    const ix = TW - 44;
    x.fillStyle = "rgba(255,255,255,.95)";
    x.beginPath(); x.arc(ix, TH * 0.48, 22, 0, 7); x.fill();
    x.fillStyle = "#111"; x.beginPath(); x.arc(ix, TH * 0.48, 18, 0, 7); x.fill();
    x.fillStyle = "#FE2C55"; heart(x, ix, TH * 0.57, 20 + Math.sin(t * 3) * 1.5);
    x.fillStyle = "#fff"; x.font = "700 13px Manrope, Arial, sans-serif"; x.textAlign = "center";
    x.fillText("48.2K", ix, TH * 0.57 + 30);
    x.beginPath(); x.ellipse(ix, TH * 0.65, 18, 15, 0, 0, 7); x.fill();
    x.fillText("1,204", ix, TH * 0.65 + 34);
    x.beginPath(); x.moveTo(ix - 16, TH * 0.73 + 10); x.lineTo(ix + 16, TH * 0.73); x.lineTo(ix - 16, TH * 0.73 - 10); x.lineTo(ix - 10, TH * 0.73); x.fill();
    x.fillText("Share", ix, TH * 0.73 + 32);
    // полоска прогресса ролика
    x.fillStyle = "rgba(255,255,255,.25)"; x.fillRect(0, TH - 4, TW, 4);
    x.fillStyle = "#fff"; x.fillRect(0, TH - 4, TW * ((t / 12) % 1), 4);
  }

  function draw(t, dt) {
    if (video && video.readyState >= 2) {
      const vw = video.videoWidth, vh = video.videoHeight, k = Math.max(TW / vw, TH / vh);
      x.drawImage(video, (TW - vw * k) / 2, (TH - vh * k) / 2, vw * k, vh * k);
    } else {
      x.drawImage(city, 0, 0);
      x.lineCap = "round";
      for (const car of cars) {
        car.p += car.v * dt * car.dir;
        if (car.p > TW + car.len) car.p = -car.len; if (car.p < -car.len) car.p = TW + car.len;
        const s = (car.y - TH * 0.74) / (TH * 0.26);
        x.strokeStyle = car.col; x.globalAlpha = 0.5 + s * 0.5; x.lineWidth = 1 + s * 3;
        x.beginPath(); x.moveTo(car.p, car.y); x.lineTo(car.p - car.len * car.dir, car.y); x.stroke();
      }
      x.globalAlpha = 1;
    }
    drawUi(t);
  }
  return { canvas: c, draw };
}

// ---------- Шейдер экрана ----------
const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const frag = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uScan, uAspect, uTexAspect, uOn;
float rr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
vec2 cover(vec2 uv){ float s = uAspect / uTexAspect; return vec2((uv.x - 0.5) * s + 0.5, uv.y); }
vec3 mush(vec2 uv){
  vec2 bs = vec2(1.0/34.0, (1.0/34.0) * uTexAspect);
  vec2 q = (floor(uv / bs) + 0.5) * bs;
  vec3 c = texture2D(uTex, q).rgb * 0.36;
  float r = 0.02;
  c += texture2D(uTex, q + vec2( r, 0.0)).rgb * 0.12;
  c += texture2D(uTex, q + vec2(-r, 0.0)).rgb * 0.12;
  c += texture2D(uTex, q + vec2(0.0,  r * uTexAspect)).rgb * 0.12;
  c += texture2D(uTex, q + vec2(0.0, -r * uTexAspect)).rgb * 0.12;
  c += texture2D(uTex, q + vec2( r, r * uTexAspect)).rgb * 0.04;
  c += texture2D(uTex, q + vec2(-r, r * uTexAspect)).rgb * 0.04;
  c += texture2D(uTex, q + vec2( r,-r * uTexAspect)).rgb * 0.04;
  c += texture2D(uTex, q + vec2(-r,-r * uTexAspect)).rgb * 0.04;
  c = floor(c * 12.0 + 0.5) / 12.0;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, 0.7) * 0.88;
}
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float d = rr(p, vec2(uAspect * 0.5, 0.5), 0.065);
  float a = 1.0 - smoothstep(-0.002, 0.002, d);
  vec2 tuv = cover(vUv);
  vec3 sharp = texture2D(uTex, tuv).rgb;
  vec3 soft = mush(tuv);
  float yb = 1.0 - uScan * 1.08 + 0.04;
  float m = smoothstep(yb - 0.003, yb + 0.003, vUv.y);
  vec3 col = mix(soft, sharp, m);
  float live = step(0.001, uScan) * (1.0 - step(0.999, uScan));
  float dy = vUv.y - yb;
  col += vec3(0.145, 0.957, 0.933) * exp(-abs(dy - 0.004) * 260.0) * 0.9 * live;
  col += vec3(0.996, 0.173, 0.333) * exp(-abs(dy + 0.004) * 260.0) * 0.9 * live;
  // остров камеры
  float isl = rr(p - vec2(0.0, 0.5 - 0.035), vec2(0.075, 0.0135), 0.0135);
  col = mix(col, vec3(0.0), 1.0 - smoothstep(-0.002, 0.002, isl));
  // блик стекла
  col += vec3(0.05) * smoothstep(0.35, 0.0, abs(vUv.x - vUv.y * 0.6 - 0.05)) * 0.6;
  col *= uOn;
  gl_FragColor = vec4(col, a);
}`;

// ---------- Сцена ----------
export function mountHero(stage, { onSharp } = {}) {
  const canvas = stage.querySelector("canvas");
  let renderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }); }
  catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const cam = new PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0, 5.4);

  const L1 = new PointLight(0x25f4ee, 9, 0, 0); L1.position.set(-3, 1.2, 1.2); scene.add(L1);
  const L2 = new PointLight(0xfe2c55, 9, 0, 0); L2.position.set(3, -1.2, 1.2); scene.add(L2);

  const phone = new Group(); scene.add(phone);
  const rrect = (W, H, R) => {
    const s = new Shape(), w = W / 2, h = H / 2, r = R;
    s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
    s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
    s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    return s;
  };
  const s = rrect(BODY_W - 2 * BEVEL, BODY_H - 2 * BEVEL, BODY_R - BEVEL);
  const bodyGeo = new ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 8, curveSegments: 32 });
  bodyGeo.center();
  const metal = new MeshPhysicalMaterial({ color: 0x1b1c22, metalness: 0.85, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.1 });
  phone.add(new Mesh(bodyGeo, metal));
  const front = DEPTH / 2 + BEVEL;
  const glass = new Mesh(new ShapeGeometry(rrect(BODY_W - 0.05, BODY_H - 0.05, BODY_R - 0.03), 24), new MeshPhysicalMaterial({ color: 0x020203, roughness: 0.08, metalness: 0, clearcoat: 1 }));
  glass.position.z = front + 0.0005; phone.add(glass);
  const btn = (x, y, hh) => { const m = new Mesh(new BoxGeometry(0.024, hh, 0.035), metal); m.position.set(x, y, 0); phone.add(m); };
  btn(BODY_W / 2 + 0.006, 0.42, 0.26); btn(-BODY_W / 2 - 0.006, 0.55, 0.12); btn(-BODY_W / 2 - 0.006, 0.3, 0.2);

  const scr = makeScreen();
  const tex = new CanvasTexture(scr.canvas);
  tex.minFilter = LinearFilter; tex.magFilter = LinearFilter; tex.generateMipmaps = false;
  const uni = { uTex: { value: tex }, uScan: { value: 0 }, uAspect: { value: SCR_W / SCR_H }, uTexAspect: { value: TW / TH }, uOn: { value: 0 } };
  const screen = new Mesh(new PlaneGeometry(SCR_W, SCR_H), new ShaderMaterial({ uniforms: uni, vertexShader: vert, fragmentShader: frag, transparent: true, toneMapped: false }));
  screen.position.z = front + 0.002; phone.add(screen);

  // ---------- Ввод ----------
  let tx = 0, ty = 0, gyro = false;
  addEventListener("pointermove", e => { if (gyro || e.pointerType === "touch") return; tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  const onOri = e => { if (e.gamma == null) return; gyro = true; tx = MathUtils.clamp(e.gamma / 30, -1, 1); ty = MathUtils.clamp((e.beta - 45) / 30, -1, 1); };
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission !== "function") addEventListener("deviceorientation", onOri, { passive: true });

  const fixedScan = parseFloat(new URLSearchParams(location.search).get("scan")); // отладка: ?scan=0.5 замораживает скан
  let start = performance.now(), scanStart = start + 900, sharpFired = false;
  const replay = () => {
    scanStart = performance.now() + 250; sharpFired = false; stage.classList.remove("sharp");
    if (DOE && typeof DOE.requestPermission === "function" && !gyro)
      DOE.requestPermission().then(s => { if (s === "granted") addEventListener("deviceorientation", onOri, { passive: true }); }).catch(() => {});
  };
  canvas.addEventListener("click", replay);
  canvas.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); replay(); } });

  // ---------- Размер, видимость ----------
  const fit = () => {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    cam.aspect = width / height;
    // на узком экране телефон должен влезать по ширине
    const need = 2.5, fitH = need / (2 * Math.tan(MathUtils.degToRad(cam.fov / 2)));
    const fitW = (1.75 / cam.aspect) / (2 * Math.tan(MathUtils.degToRad(cam.fov / 2)));
    cam.position.z = Math.max(fitH, fitW);
    cam.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(stage); fit();
  let visible = true, raf = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop(performance.now()); }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible && !raf) loop(performance.now()); });

  let rx = 0, ry = -1.1, last = performance.now(), texT = 0;
  const ease = t => 1 - Math.pow(1 - MathUtils.clamp(t, 0, 1), 3);
  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - start) / 1000;
    const intro = ease((now - start) / 1400);
    const sc = MathUtils.clamp(window.scrollY / Math.max(1, stage.offsetHeight), 0, 1);
    const wantY = MathUtils.lerp(-1.1, -0.3, intro) + tx * 0.35 + sc * 0.55;
    const wantX = 0.08 + ty * 0.18 - sc * 0.15;
    ry += (wantY - ry) * Math.min(1, dt * 5); rx += (wantX - rx) * Math.min(1, dt * 5);
    phone.rotation.set(rx, ry, -0.04 + tx * 0.03);
    phone.position.y = Math.sin(t * 1.1) * 0.03;
    uni.uOn.value = ease((now - start - 200) / 600);
    const k = MathUtils.clamp((now - scanStart) / 1800, 0, 1);
    uni.uScan.value = fixedScan >= 0 && fixedScan <= 1 ? fixedScan : (k < 1 ? k * k * (3 - 2 * k) : 1);
    if (k >= 1 && !sharpFired) { sharpFired = true; stage.classList.add("sharp"); onSharp && onSharp(); }
    texT += dt;
    if (texT > 1 / 30) { scr.draw(t, texT); tex.needsUpdate = true; texT = 0; }
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  }
  scr.draw(0, 0); tex.needsUpdate = true;
  loop(performance.now());
  stage.classList.add("live");
  return { replay };
}
