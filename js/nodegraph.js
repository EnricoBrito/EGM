/**
 * EGM — node graph background (v2)
 *
 * A assinatura visual do site: uma rede de nós no formato de um fluxo de
 * automação (n8n), que é o meio em que a EGM trabalha todo dia.
 *
 * O que mudou em relação à v1 (e por que):
 *  - Nós ANCORADOS: cada nó tem uma "casa" numa grade irregular e só
 *    flutua em volta dela. Na v1 os nós andavam soltos pela tela e, com o
 *    tempo, embolavam num canto e abriam buracos em outro. Agora a rede
 *    fica sempre bem distribuída.
 *  - Links calculados uma vez, no máximo 3 por nó: desenho de fluxo, não
 *    teia. Na v1, com raio fixo de 190px, uma tela de celular virava um
 *    emaranhado de linhas por cima do texto.
 *  - Tudo escala com a tela: espaçamento, tamanho e quantidade de nós.
 *  - Opção `avoid`: a rede fica mais apagada atrás de um elemento (o texto
 *    do hero), com transição suave. Legível no celular sem perder o fundo.
 *  - Pulsos de dados percorrem alguns caminhos, como uma execução passando
 *    pelo fluxo. Desligados com prefers-reduced-motion.
 *  - Não recria a rede a cada mudança pequena de altura (barra de endereço
 *    do celular aparecendo/sumindo), e pausa fora da tela ou em aba oculta.
 *
 * Monocromático por design: só a cor do papel (#F1F0EC) em opacidades.
 */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INK = '241,240,236';

  // PRNG com semente: a mesma tela sempre gera a mesma rede (nada "pula"
  // quando a rede é recriada num resize).
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  function initNodeGraph(canvas, options) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const opts = Object.assign({
      spacing: [70, 118],   // distância entre âncoras (min/máx, px)
      cellsAcross: 11,      // quantas "casas" cabem na largura (desktop)
      cellsAcrossMobile: 5, // idem, em telas < 700px
      linkFactor: 1.6,      // liga nós com âncoras a até spacing * linkFactor
      maxLinks: 3,
      drop: 0.12,           // fração de casas vazias (deixa a rede orgânica)
      drift: 9,             // quanto um nó passeia em volta da âncora (px)
      lineAlpha: 0.24,
      nodeAlpha: 0.7,
      hubs: 0.1,            // fração de nós desenhados como "caixinha" de fluxo
      pulses: true,
      avoid: null,          // elemento cujo retângulo deixa a rede mais apagada
      avoidStrength: 0.72,  // 0 = não apaga, 1 = some atrás do elemento
      avoidFeather: 90,     // px de transição ao redor do elemento
      depth: true,          // camada de fundo mais fina e apagada (dá profundidade)
      seed: 11
    }, options);

    let W = 0, H = 0, dpr = 1;
    let nodes = [], edges = [], adj = [], pulses = [];
    let back = { nodes: [], edges: [] };
    let avoidRect = null;
    let visible = false, rafId = null, lastT = 0, spawnIn = 0.4;

    /* ---------- layout ---------- */
    function makeLayer(rand, s, drift, maxLinks, rScale) {
      const rowH = s * 0.88;
      const cols = Math.ceil(W / s) + 2;
      const rows = Math.ceil(H / rowH) + 2;
      const ns = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rand() < opts.drop) continue;
          const offset = (r % 2) * s * 0.5;               // linhas intercaladas
          const ax = (c - 0.5) * s + offset + (rand() - 0.5) * s * 0.7;
          const ay = (r - 0.5) * rowH + (rand() - 0.5) * rowH * 0.7;
          ns.push({
            ax, ay, x: ax, y: ay,
            fx: 0.12 + rand() * 0.22, fy: 0.1 + rand() * 0.22,   // frequência da deriva
            px: rand() * Math.PI * 2, py: rand() * Math.PI * 2,  // fase
            amp: drift * (0.45 + rand() * 0.55),
            r: (0.9 + rand() * 1.1) * rScale,
            hub: false, flash: 0, dim: 1
          });
        }
      }
      // arestas: vizinhos mais próximos primeiro, respeitando maxLinks
      const maxD = s * opts.linkFactor;
      const cand = [];
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const d = Math.hypot(ns[i].ax - ns[j].ax, ns[i].ay - ns[j].ay);
          if (d < maxD) cand.push([d, i, j]);
        }
      }
      cand.sort((a, b) => a[0] - b[0]);
      const deg = new Array(ns.length).fill(0);
      const es = [], ad = ns.map(() => []);
      for (const [d, i, j] of cand) {
        if (deg[i] >= maxLinks || deg[j] >= maxLinks) continue;
        deg[i]++; deg[j]++;
        ad[i].push([j, es.length]); ad[j].push([i, es.length]);
        es.push({ i, j, len: d, glow: 0, fade: 1 - (d / maxD) * 0.55 });
      }
      return { nodes: ns, edges: es, adj: ad };
    }

    function build() {
      const rand = mulberry32(opts.seed);
      const mobile = W < 700;
      const across = mobile ? opts.cellsAcrossMobile : opts.cellsAcross;
      const s = clamp(Math.min(W, 1440) / across, opts.spacing[0], opts.spacing[1]);

      const main = makeLayer(rand, s, opts.drift, opts.maxLinks, 1);
      nodes = main.nodes; edges = main.edges; adj = main.adj;
      nodes.forEach((n) => { n.hub = rand() < opts.hubs; });

      back = opts.depth
        ? makeLayer(mulberry32(opts.seed * 13 + 1), s * 0.56, opts.drift * 0.6, 3, 0.6)
        : { nodes: [], edges: [] };
      pulses = [];
    }

    function measureAvoid() {
      if (!opts.avoid) { avoidRect = null; return; }
      const a = opts.avoid.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      avoidRect = { x: a.left - c.left, y: a.top - c.top, w: a.width, h: a.height };
    }

    function dimAt(x, y) {
      if (!avoidRect) return 1;
      const r = avoidRect;
      const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
      const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
      const dist = Math.hypot(dx, dy);
      const low = 1 - opts.avoidStrength;
      return low + (1 - low) * smooth(dist / opts.avoidFeather);
    }

    /* ---------- pulsos (execução passando pelo fluxo) ---------- */
    function spawnPulse(rand) {
      if (!edges.length) return;
      let start = Math.floor(rand() * nodes.length), tries = 0;
      while (adj[start].length === 0 && tries++ < 20) start = Math.floor(rand() * nodes.length);
      if (!adj[start].length) return;
      const hops = 3 + Math.floor(rand() * 4);
      const path = [start];
      let prev = -1, cur = start;
      for (let h = 0; h < hops; h++) {
        const opts2 = adj[cur].filter(([n]) => n !== prev);
        if (!opts2.length) break;
        const [next] = opts2[Math.floor(rand() * opts2.length)];
        path.push(next); prev = cur; cur = next;
      }
      if (path.length < 2) return;
      pulses.push({ path, seg: 0, t: 0, speed: 70 + rand() * 50 });
    }
    const pulseRand = mulberry32(opts.seed * 7 + 3);

    /* ---------- render ---------- */
    function update(time, dt) {
      const t = time / 1000;
      for (const n of nodes) {
        n.x = n.ax + Math.sin(t * n.fx + n.px) * n.amp;
        n.y = n.ay + Math.cos(t * n.fy + n.py) * n.amp;
        n.dim = dimAt(n.x, n.y);
        if (n.flash > 0) n.flash = Math.max(0, n.flash - dt * 1.6);
      }
      for (const n of back.nodes) {
        n.x = n.ax + Math.sin(t * n.fx * 0.7 + n.px) * n.amp;
        n.y = n.ay + Math.cos(t * n.fy * 0.7 + n.py) * n.amp;
        n.dim = dimAt(n.x, n.y);
      }
      for (const e of edges) if (e.glow > 0) e.glow = Math.max(0, e.glow - dt * 1.2);

      if (opts.pulses && !reduceMotion) {
        spawnIn -= dt;
        const maxPulses = Math.max(2, Math.round(nodes.length / 22));
        if (spawnIn <= 0 && pulses.length < maxPulses) {
          spawnPulse(pulseRand);
          spawnIn = 0.5 + pulseRand() * 1.1;
        }
        for (const p of pulses) {
          const a = nodes[p.path[p.seg]], b = nodes[p.path[p.seg + 1]];
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          p.t += (p.speed * dt) / len;
          const ek = adj[p.path[p.seg]].find(([n]) => n === p.path[p.seg + 1]);
          if (ek) edges[ek[1]].glow = Math.min(1, edges[ek[1]].glow + dt * 4);
          if (p.t >= 1) {
            b.flash = 1;
            p.seg++; p.t = 0;
            if (p.seg >= p.path.length - 1) p.done = true;
          }
        }
        pulses = pulses.filter((p) => !p.done);
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // camada de fundo: mais fina, mais apagada, sem pulsos
      if (back.nodes.length) {
        // agrupa por opacidade (poucas chamadas de stroke = leve no celular)
        const buckets = new Map();
        ctx.lineWidth = 0.7;
        for (const e of back.edges) {
          const a = back.nodes[e.i], b = back.nodes[e.j];
          const alpha = opts.lineAlpha * 0.42 * e.fade * Math.min(a.dim, b.dim);
          if (alpha < 0.01) continue;
          const key = Math.round(alpha * 200) / 200;
          let list = buckets.get(key);
          if (!list) buckets.set(key, (list = []));
          list.push(a, b);
        }
        buckets.forEach((list, alpha) => {
          ctx.strokeStyle = `rgba(${INK},${alpha})`;
          ctx.beginPath();
          for (let k = 0; k < list.length; k += 2) { ctx.moveTo(list[k].x, list[k].y); ctx.lineTo(list[k + 1].x, list[k + 1].y); }
          ctx.stroke();
        });
        const nodeBuckets = new Map();
        for (const n of back.nodes) {
          const key = Math.round(opts.nodeAlpha * 0.4 * n.dim * 100) / 100;
          let list = nodeBuckets.get(key);
          if (!list) nodeBuckets.set(key, (list = []));
          list.push(n);
        }
        nodeBuckets.forEach((list, alpha) => {
          ctx.fillStyle = `rgba(${INK},${alpha})`;
          ctx.beginPath();
          for (const n of list) { ctx.moveTo(n.x + n.r, n.y); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); }
          ctx.fill();
        });
      }

      // links
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = nodes[e.i], b = nodes[e.j];
        const dim = Math.min(a.dim, b.dim);
        const alpha = (opts.lineAlpha * e.fade + e.glow * 0.32) * dim;
        if (alpha < 0.012) continue;
        ctx.strokeStyle = `rgba(${INK},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // nós
      for (const n of nodes) {
        const a = (opts.nodeAlpha + n.flash * 0.3) * n.dim;
        if (n.hub) {
          const s = 5.5 + n.flash * 1.5;
          ctx.fillStyle = 'rgba(10,10,10,1)';
          ctx.strokeStyle = `rgba(${INK},${(a * 0.85).toFixed(3)})`;
          ctx.lineWidth = 1;
          roundRect(n.x - s / 2, n.y - s / 2, s, s, 1.4);
          ctx.fill(); ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(${INK},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + n.flash * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        if (n.flash > 0.02) {
          ctx.strokeStyle = `rgba(${INK},${(n.flash * 0.35 * n.dim).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 4 + (1 - n.flash) * 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // pulsos
      for (const p of pulses) {
        const a = nodes[p.path[p.seg]], b = nodes[p.path[p.seg + 1]];
        const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
        const tailT = Math.max(0, p.t - 0.28);
        const tx = a.x + (b.x - a.x) * tailT, ty = a.y + (b.y - a.y) * tailT;
        const dim = dimAt(x, y);
        const grad = ctx.createLinearGradient(tx, ty, x, y);
        grad.addColorStop(0, `rgba(${INK},0)`);
        grad.addColorStop(1, `rgba(${INK},${(0.75 * dim).toFixed(3)})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = `rgba(${INK},${(0.95 * dim).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
      }
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    /* ---------- loop ---------- */
    function frame(time) {
      const dt = Math.min(0.05, lastT ? (time - lastT) / 1000 : 0.016);
      lastT = time;
      update(time, dt);
      draw();
      rafId = (visible && !document.hidden) ? requestAnimationFrame(frame) : null;
    }
    function start() {
      if (reduceMotion) { update(0, 0); draw(); return; }
      if (rafId === null && visible && !document.hidden) { lastT = 0; rafId = requestAnimationFrame(frame); }
    }

    /* ---------- tamanho ---------- */
    let builtW = 0, builtH = 0;
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = w; H = h;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // só recria a rede se a largura mudou ou a altura mudou de verdade
      // (evita "pulo" quando a barra do navegador no celular some/aparece)
      if (Math.abs(W - builtW) > 1 || Math.abs(H - builtH) > 120 || !nodes.length) {
        build(); builtW = W; builtH = H;
      }
      measureAvoid();
      update(performance.now(), 0);
      draw();
    }

    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, nodes.length ? 120 : 0);
    });
    ro.observe(canvas);
    if (opts.avoid) ro.observe(opts.avoid);
    resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureAvoid(); });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { visible = entry.isIntersecting; if (visible) start(); });
    }, { threshold: 0.02 });
    io.observe(canvas);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

    return { refresh: resize };
  }

  window.EGM_initNodeGraph = initNodeGraph;
})();
