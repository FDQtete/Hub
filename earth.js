// UDP Hub — fondo: Tierra nocturna rotando con luces de ciudades (canvas)
// Define window.__earth (setDepth / pulse) y se ejecuta solo al cargar.

function initEarth() {
  const canvas = document.getElementById('earth');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1;
  let stars = [];
  let cities = [];
  let rot = 0;
  let zoom = 1, zoomBase = 1, zoomPulse = 0;
  const tilt = -0.36;

  window.__earth = {
    setDepth(d) { zoomBase = 1 + Math.min(Math.max(d - 1, 0), 3) * 0.13; },
    pulse() { zoomPulse = 0.14; },
  };

  const CLUSTERS = [
    [2, 48, 40], [0, 52, 24], [12, 45, 18], [24, 45, 14], [37, 55, 22],
    [31, 30, 16], [35, 32, 14], [45, 30, 12], [55, 25, 10],
    [78, 22, 46], [88, 24, 24], [73, 19, 18], [100, 14, 16],
    [116, 32, 44], [120, 30, 20], [108, 23, 16], [135, 35, 30], [127, 37, 14],
    [106, 11, 18], [110, -7, 22], [121, 14, 12],
    [3, 8, 16], [8, 5, 10], [28, -26, 12], [36, -1, 8],
    [-77, 39, 30], [-87, 41, 16], [-95, 30, 16], [-118, 34, 22], [-122, 38, 12],
    [-99, 19, 24], [-74, 5, 10], [-58, -34, 16], [-46, -23, 22], [-43, -23, 12],
    [-70, -33, 10], [151, -33, 16], [145, -38, 10], [174, -37, 6],
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

  function buildCities() {
    cities = [];
    CLUSTERS.forEach(([lon, lat, weight]) => {
      const n = Math.round(weight * 1.1);
      for (let i = 0; i < n; i++) {
        cities.push({
          lon: (lon + gauss() * 9) * Math.PI / 180,
          lat: (lat + gauss() * 6) * Math.PI / 180,
          b: rand(0.45, 1),
          tw: Math.random() * Math.PI * 2,
        });
      }
    });
    for (let i = 0; i < 140; i++) {
      cities.push({
        lon: rand(-180, 180) * Math.PI / 180,
        lat: Math.asin(rand(-1, 1)),
        b: rand(0.15, 0.4),
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  function buildStars() {
    stars = [];
    const count = Math.round((W * H) / 7000);
    for (let i = 0; i < count; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + 0.2, a: rand(0.2, 0.8), tw: Math.random() * Math.PI * 2 });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
    if (!cities.length) buildCities();
  }

  function draw(t) {
    const time = t * 0.001;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      const a = s.a * (0.6 + 0.4 * Math.sin(time * 1.5 + s.tw));
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#cfd6e6';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const zTarget = zoomBase + zoomPulse;
    zoom += (zTarget - zoom) * 0.08;
    zoomPulse *= 0.90;

    const cx = W * 0.74, cy = H * 0.5, R = Math.min(W, H) * 0.46 * zoom;

    const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.28);
    halo.addColorStop(0, 'rgba(255, 140, 43, 0.12)');
    halo.addColorStop(0.5, 'rgba(255, 120, 40, 0.05)');
    halo.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2); ctx.fill();

    const sphere = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    sphere.addColorStop(0, '#0b1320'); sphere.addColorStop(0.6, '#070b13'); sphere.addColorStop(1, '#02040a');
    ctx.fillStyle = sphere;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    for (const c of cities) {
      const lambda = c.lon + rot;
      const cosLat = Math.cos(c.lat);
      let x = cosLat * Math.sin(lambda);
      let y = Math.sin(c.lat);
      let z = cosLat * Math.cos(lambda);
      const y2 = y * cosT - z * sinT;
      const z2 = y * sinT + z * cosT;
      y = y2; z = z2;
      if (z <= 0.02) continue;
      const sx = cx + x * R;
      const sy = cy - y * R;
      const depth = Math.pow(z, 0.6);
      const tw = 0.75 + 0.25 * Math.sin(time * 2 + c.tw);
      const alpha = Math.min(1, c.b * depth * tw);
      const size = 0.6 + c.b * 1.4;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2.4);
      g.addColorStop(0, `rgba(255, 214, 150, ${alpha})`);
      g.addColorStop(0.4, `rgba(255, 160, 70, ${alpha * 0.8})`);
      g.addColorStop(1, 'rgba(255, 130, 40, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, size * 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    const edge = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = edge;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(255, 170, 90, 0.18)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, Math.PI * 2); ctx.stroke();

    if (!prefersReduced) rot += 0.0016;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
}

initEarth();
