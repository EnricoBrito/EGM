/**
 * EGM — node graph background
 * Draws a sparse, drifting network of connected nodes inside a dark
 * container. This is the site's signature visual: it's literally the
 * shape of an n8n workflow — the medium EGM builds in every day.
 * Monochrome by design (paper-colored nodes/lines only, no accent color).
 */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initNodeGraph(canvas, options) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const opts = Object.assign({ density: 0.00016, maxLinkDist: 170, speed: 0.15 }, options);
    let width, height, nodes, dpr;
    let running = false;
    let rafId = null;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, width * dpr);
      canvas.height = Math.max(1, height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      draw();
    }

    function seed() {
      const count = Math.max(24, Math.round(width * height * opts.density));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * opts.speed,
        vy: (Math.random() - 0.5) * opts.speed,
        r: Math.random() * 1.3 + 0.9,
        pulse: Math.random() * Math.PI * 2
      }));
    }

    function draw() {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);

      // links
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < opts.maxLinkDist) {
            const alpha = (1 - dist / opts.maxLinkDist) * 0.32;
            ctx.strokeStyle = `rgba(241,240,236,${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // nodes — soft brightness pulse only, no color shift
      for (const n of nodes) {
        const glow = (Math.sin(n.pulse) + 1) / 2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(241,240,236,${0.4 + glow * 0.5})`;
        ctx.fill();
      }
    }

    function tick() {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        n.pulse += 0.02;
      }
      draw();
      if (running) rafId = requestAnimationFrame(tick);
      else rafId = null;
    }

    function ensureRunning() {
      if (!running) return;
      if (reduceMotion) { draw(); return; }
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    resize();

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        running = entry.isIntersecting;
        if (running) ensureRunning();
      });
    }, { threshold: 0.05 });
    io.observe(canvas);
  }

  window.EGM_initNodeGraph = initNodeGraph;
})();
