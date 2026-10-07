/**
 * The Nordlys sky: aurora curtains across the top of the screen and light
 * snowfall. Pure ambience on DOM canvases above the game; it never reacts to
 * Hermes events, so it can never be read as work.
 */
export function startSky(root: HTMLElement, darkness: () => number): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const aurora = document.createElement('canvas');
  aurora.id = 'aurora';
  aurora.width = 240; aurora.height = 90;
  const snow = document.createElement('canvas');
  snow.id = 'snow';
  root.prepend(aurora, snow);
  const actx = aurora.getContext('2d')!;
  const sctx = snow.getContext('2d')!;

  const flakes = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.4, v: 0.012 + Math.random() * 0.03, p: Math.random() * 6.28 }));
  let last = performance.now();
  let t = Math.random() * 100;

  const draw = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!reduced) t += dt;
    const night = Math.max(0, Math.min(1, darkness() / 0.78));
    aurora.style.opacity = String(0.6 + night * 0.4);

    // Curtains: vertical streaks whose base wanders, green at the hem, violet above.
    const w = aurora.width, h = aurora.height;
    actx.clearRect(0, 0, w, h);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const base = h * (0.46 + 0.16 * Math.sin(u * 6.1 + t * 0.21) + 0.08 * Math.sin(u * 13.7 - t * 0.37));
      const glow = Math.max(0, 0.55 + 0.45 * Math.sin(u * 9.3 + t * 0.5) * Math.sin(u * 3.1 - t * 0.13));
      const ray = 0.6 + 0.4 * Math.sin(x * 1.7 + t * 2.3) * Math.sin(x * 0.31 - t * 0.7);
      const a = glow * ray;
      if (a < 0.03) continue;
      const g = actx.createLinearGradient(0, base + 6, 0, base - h * 0.55);
      g.addColorStop(0, 'rgba(60,242,176,0)');
      g.addColorStop(0.12, `rgba(80,255,190,${0.95 * a})`);
      g.addColorStop(0.45, `rgba(42,212,217,${0.6 * a})`);
      g.addColorStop(0.8, `rgba(150,108,255,${0.4 * a})`);
      g.addColorStop(1, 'rgba(150,108,255,0)');
      actx.fillStyle = g;
      actx.fillRect(x, 0, 1, h);
    }

    // Snow, at device resolution.
    const W = snow.clientWidth, H = snow.clientHeight;
    if (snow.width !== W || snow.height !== H) { snow.width = W; snow.height = H; }
    sctx.clearRect(0, 0, W, H);
    sctx.fillStyle = 'rgba(235,244,255,0.75)';
    for (const f of flakes) {
      if (!reduced) {
        f.y += f.v * dt * 3;
        f.x += Math.sin(t * 0.8 + f.p) * dt * 0.006;
        if (f.y > 1) { f.y = -0.02; f.x = Math.random(); }
      }
      sctx.beginPath();
      sctx.arc(((f.x % 1) + 1) % 1 * W, f.y * H, f.r, 0, 6.283);
      sctx.fill();
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
