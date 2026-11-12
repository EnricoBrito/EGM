/**
 * EGM — node graph background (v4, leve)
 *
 * A assinatura visual do site: uma rede de nós no formato de um fluxo de
 * automação (n8n), que é o meio em que a EGM trabalha todo dia.
 *
 * Como funciona:
 *  - Nós ANCORADOS: cada nó tem uma "casa" numa grade irregular e só
 *    flutua em volta dela, então a rede fica sempre bem distribuída.
 *  - Links calculados uma vez, no máximo 3-4 por nó: desenho de fluxo, não teia.
 *  - Tudo escala com a tela: espaçamento, tamanho e quantidade de nós.
 *  - Opção `avoid`: a rede fica mais apagada atrás de um elemento (o texto
 *    do hero), pra manter a leitura sem perder o fundo.
 *  - Pulsos de dados percorrem alguns caminhos, como uma execução passando
 *    pelo fluxo.
 *  - PONTEIRO: o mouse (ou o dedo) vira um nó vivo. Os nós próximos são
 *    puxados com mola, os fios perto acendem e fios finos ligam o ponteiro
 *    aos nós mais próximos. Arrastar "agarra" a rede; clicar solta uma onda.
 *    Sem ponteiro, `ambient` faz uma luz fantasma passear pela rede.
 *
 * DESEMPENHO (v4) — o que mudou e por quê:
 *  - O desenho é AGRUPADO por transparência: em vez de uma chamada de
 *    traçado por fio e por nó (centenas por quadro), são poucas dezenas.
 *  - No máximo ~60 quadros/s (telas de 120/144 Hz não dobram o trabalho) e
 *    resolução limitada a 1.5x (telas Retina não quadruplicam os pixels).
 *  - A transparência por proximidade do texto (avoid) é calculada uma vez,
 *    não a cada quadro; nós em repouso não gastam física.
 *  - QUALIDADE ADAPTATIVA (compartilhada por todos os fundos da página):
 *    se os quadros demoram demais por um tempo, o fundo simplifica sozinho
 *    (nível 1: 30 quadros/s, resolução 1x, sem camada de trás e sem pulsos)
 *    e, se ainda assim não der, congela num quadro estático (nível 2).
 *    Só pausa/simplifica; nunca volta atrás, pra não ficar oscilando.
 *  - Pausa fora da tela e em aba oculta. prefers-reduced-motion: estático.
 *
 * Monocromático por design: só a cor do papel (#F1F0EC) em opacidades.
 */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INK = '241,240,236';

  // ---------- qualidade adaptativa (uma só pra página toda) ----------
  // 0 = completo | 1 = leve | 2 = estático
  let quality = 0;
  const instances = new Set();
  function degrade() {
    if (quality >= 2) return;
    quality++;
    instances.forEach((i) => i.applyQuality());
  }

  // PRNG com semente: a mesma tela sempre gera a mesma rede.
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

  // grupos de desenho reaproveitados entre quadros (sem alocar arrays novos)
  const mkBuckets = (n) => Array.from({ length: n + 1 }, () => []);

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
      interactive: true,    // mouse/dedo interagem com a rede
      ambient: false,       // sem ponteiro, uma luz fantasma passeia pela rede
      host: null,           // quem escuta o ponteiro (padrão: o elemento pai do canvas)
      seed: 11
    }, options);

    let W = 0, H = 0, dpr = 1;
    let nodes = [], edges = [], adj = [], pulses = [];
    let back = { nodes: [], edges: [] };
    let avoidRect = null;
    let visible = false, rafId = null, lastT = 0, lastDraw = 0, spawnIn = 0.4;
    let slow = 0, warm = 0;                  // saúde dos quadros (qualidade adaptativa)

    // ponteiro (mouse, dedo ou luz fantasma) e ondas de clique
    const probe = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, a: 0, press: 0, cx: 0, cy: 0, real: false, down: false, touch: false, snap: false };
    let ripples = [];
    let reach = 150, pullMax = 24;           // calculados em build() a partir do espaçamento
    const SPRING_K = 40, SPRING_C = 6.4;     // mola: volta balançando um pouco
    const RIPPLE_LIFE = 1.15, RIPPLE_SPEED = 340;

    const EB = mkBuckets(60), NB = mkBuckets(60), BEB = mkBuckets(60), BNB = mkBuckets(60);

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
            hub: false, flash: 0, dim: 1,
            ox: 0, oy: 0, ovx: 0, ovy: 0, f: 0, rest: true      // deslocamento causado pelo ponteiro
          });
        }
      }
      // arestas: vizinhos mais próximos primeiro, respeitando maxLinks
      const maxD = s * opts.linkFactor;
      const cand = [];
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[i].ax - ns[j].ax;
          if (dx > maxD || dx < -maxD) continue;
          const d = Math.hypot(dx, ns[i].ay - ns[j].ay);
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

      reach = clamp(s * 1.9, 120, 210);
      pullMax = clamp(s * 0.34, 18, 34);
      const main = makeLayer(rand, s, opts.drift, opts.maxLinks, 1);
      nodes = main.nodes; edges = main.edges; adj = main.adj;
      nodes.forEach((n) => { n.hub = rand() < opts.hubs; });

      // camada de trás: só no nível completo, e mais espaçada que antes (menos nós)
      back = (opts.depth && quality === 0)
        ? makeLayer(mulberry32(opts.seed * 13 + 1), s * 0.72, opts.drift * 0.6, 3, 0.7)
        : { nodes: [], edges: [] };
      pulses = [];
    }

    function measureAvoid() {
      if (!opts.avoid) { avoidRect = null; }
      else {
        const a = opts.avoid.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        avoidRect = { x: a.left - c.left, y: a.top - c.top, w: a.width, h: a.height };
      }
      recomputeDim();
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

    // a transparência perto do texto muda só quando o layout muda: calcula
    // pela âncora de cada nó (a deriva é pequena perto da transição de 90px)
    function recomputeDim() {
      for (const n of nodes) n.dim = dimAt(n.ax, n.ay);
      for (const n of back.nodes) n.dim = dimAt(n.ax, n.ay);
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

    /* ---------- ponteiro ---------- */
    function updateProbe(time, dt) {
      const t = time / 1000;
      let target = 0;
      if (probe.real) {
        const r = canvas.getBoundingClientRect();   // relido a cada quadro: acompanha a rolagem
        probe.tx = probe.cx - r.left; probe.ty = probe.cy - r.top;
        target = 1;
      } else if (opts.ambient) {
        probe.tx = W * (0.5 + 0.38 * Math.sin(t * 0.21 + 0.6));
        probe.ty = H * (0.5 + 0.32 * Math.sin(t * 0.33 + 1.7));
        target = 0.5;
      }
      const px = probe.x, py = probe.y;
      let jumped = false;
      if (probe.snap || dt === 0) {
        probe.x = probe.tx; probe.y = probe.ty; probe.snap = false; jumped = true;
      } else {
        const k = 1 - Math.exp(-dt * (probe.real ? 18 : 2.5));   // o fantasma desliza mais devagar
        probe.x += (probe.tx - probe.x) * k;
        probe.y += (probe.ty - probe.y) * k;
      }
      if (dt > 0) {
        if (!jumped) {
          const kv = 1 - Math.exp(-dt * 10);
          probe.vx += ((probe.x - px) / dt - probe.vx) * kv;
          probe.vy += ((probe.y - py) / dt - probe.vy) * kv;
          const sp = Math.hypot(probe.vx, probe.vy);
          if (sp > 1600) { probe.vx *= 1600 / sp; probe.vy *= 1600 / sp; }
        }
        probe.a += (target - probe.a) * (1 - Math.exp(-dt * 5));
        probe.press += ((probe.down ? 1 : 0) - probe.press) * (1 - Math.exp(-dt * 9));
      }
      for (const r of ripples) r.t += dt;
      if (ripples.length) ripples = ripples.filter((r) => r.t < RIPPLE_LIFE);
    }

    // Move um nó em volta da posição-base (bx, by): puxão em direção ao
    // ponteiro, arrasto junto com ele, ondas de clique, e uma mola que traz de volta.
    function interact(n, bx, by, dt, scale, active) {
      if (!active && n.rest) { n.f = 0; return; }     // em repouso e sem ponteiro: nada a calcular
      const R = reach * (1 + 0.35 * probe.press);
      let desX = 0, desY = 0, f = 0;
      if (probe.a > 0.01) {
        const dx = probe.x - bx, dy = probe.y - by;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < R) {
          f = smooth(1 - d / R) * probe.a;
          const mag = Math.min(pullMax * (1 + 0.9 * probe.press) * f * scale, d * 0.55);
          desX = (dx / d) * mag; desY = (dy / d) * mag;
          const grab = Math.min(1, f * (2.6 + 5 * probe.press) * dt);   // arrasto: o nó é levado junto
          n.ovx += (probe.vx * 0.3 * scale - n.ovx) * grab;
          n.ovy += (probe.vy * 0.3 * scale - n.ovy) * grab;
        }
      }
      for (const r of ripples) {
        const dx = bx - r.x, dy = by - r.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const w = 1 - Math.abs(d - r.t * RIPPLE_SPEED) / 60;
        if (w > 0) {
          const imp = 520 * w * (1 - r.t / RIPPLE_LIFE) * scale * dt;
          n.ovx += (dx / d) * imp; n.ovy += (dy / d) * imp;
        }
      }
      n.ovx += (SPRING_K * (desX - n.ox) - SPRING_C * n.ovx) * dt;
      n.ovy += (SPRING_K * (desY - n.oy) - SPRING_C * n.ovy) * dt;
      n.ox = clamp(n.ox + n.ovx * dt, -80, 80);
      n.oy = clamp(n.oy + n.ovy * dt, -80, 80);
      n.f = f;
      if (!active && Math.abs(n.ox) + Math.abs(n.oy) + Math.abs(n.ovx) + Math.abs(n.ovy) < 0.03) {
        n.ox = n.oy = n.ovx = n.ovy = 0; n.rest = true;   // assentou
      } else {
        n.rest = false;
      }
    }

    /* ---------- render ---------- */
    function update(time, dt) {
      const t = time / 1000;
      const live = opts.interactive && !reduceMotion && quality < 2;
      if (live) updateProbe(time, dt);
      const active = live && (probe.a > 0.01 || ripples.length > 0);
      for (const n of nodes) {
        const bx = n.ax + Math.sin(t * n.fx + n.px) * n.amp;
        const by = n.ay + Math.cos(t * n.fy + n.py) * n.amp;
        if (live) interact(n, bx, by, dt, 1, active);
        n.x = bx + n.ox; n.y = by + n.oy;
        if (n.flash > 0) n.flash = Math.max(0, n.flash - dt * 1.6);
      }
      for (const n of back.nodes) {
        const bx = n.ax + Math.sin(t * n.fx * 0.7 + n.px) * n.amp;
        const by = n.ay + Math.cos(t * n.fy * 0.7 + n.py) * n.amp;
        if (live) interact(n, bx, by, dt, 0.4, active);   // camada de trás reage menos: profundidade
        n.x = bx + n.ox; n.y = by + n.oy;
      }
      for (const e of edges) if (e.glow > 0) e.glow = Math.max(0, e.glow - dt * 1.2);

      if (opts.pulses && !reduceMotion && quality === 0) {
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

    // desenha todos os grupos (cada um uma única chamada de traçado)
    function strokeBuckets(buckets, scale) {
      for (let k = 1; k < buckets.length; k++) {
        const list = buckets[k];
        if (!list.length) continue;
        ctx.strokeStyle = `rgba(${INK},${(k / scale).toFixed(3)})`;
        ctx.beginPath();
        for (let q = 0; q < list.length; q += 4) { ctx.moveTo(list[q], list[q + 1]); ctx.lineTo(list[q + 2], list[q + 3]); }
        ctx.stroke();
        list.length = 0;
      }
    }
    function fillBuckets(buckets, scale) {
      for (let k = 1; k < buckets.length; k++) {
        const list = buckets[k];
        if (!list.length) continue;
        ctx.fillStyle = `rgba(${INK},${(k / scale).toFixed(3)})`;
        ctx.beginPath();
        for (let q = 0; q < list.length; q += 3) { ctx.moveTo(list[q] + list[q + 2], list[q + 1]); ctx.arc(list[q], list[q + 1], list[q + 2], 0, Math.PI * 2); }
        ctx.fill();
        list.length = 0;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const Rn = reach * (1 + 0.35 * probe.press);
      const probeOn = opts.interactive && probe.a > 0.02;

      // camada de trás: mais fina e apagada, sem pulsos
      if (back.nodes.length) {
        for (const e of back.edges) {
          const a = back.nodes[e.i], b = back.nodes[e.j];
          const alpha = opts.lineAlpha * 0.42 * e.fade * (a.dim < b.dim ? a.dim : b.dim);
          const k = Math.min(60, Math.round(alpha * 200));
          if (k < 2) continue;
          BEB[k].push(a.x, a.y, b.x, b.y);
        }
        strokeBuckets(BEB, 200);
        for (const n of back.nodes) {
          const k = Math.min(60, Math.round(opts.nodeAlpha * 0.4 * n.dim * 100));
          if (k < 1) continue;
          BNB[k].push(n.x, n.y, n.r);
        }
        fillBuckets(BNB, 100);
      }

      // links
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = nodes[e.i], b = nodes[e.j];
        const dim = a.dim < b.dim ? a.dim : b.dim;
        let alpha = (opts.lineAlpha * e.fade + e.glow * 0.32) * dim;
        if (probeOn) {   // fios perto do ponteiro acendem
          const mx = (a.x + b.x) / 2 - probe.x, my = (a.y + b.y) / 2 - probe.y;
          alpha += smooth(1 - Math.hypot(mx, my) / (Rn * 1.05)) * probe.a * 0.3 * Math.max(dim, 0.55);
        }
        const k = Math.min(60, Math.round(alpha * 60));
        if (k < 1) continue;
        EB[k].push(a.x, a.y, b.x, b.y);
      }
      strokeBuckets(EB, 60);

      // nós redondos (agrupados) e "caixinhas" de fluxo (os hubs, poucos)
      let anyFlash = false;
      for (const n of nodes) {
        if (n.flash > 0.02) anyFlash = true;
        const a = (opts.nodeAlpha + n.flash * 0.3) * n.dim + n.f * 0.3 * Math.max(n.dim, 0.55);
        if (n.hub) continue;
        const k = Math.min(60, Math.round(a * 60));
        if (k < 1) continue;
        NB[k].push(n.x, n.y, n.r + n.flash * 0.8 + n.f * 1.2);
      }
      fillBuckets(NB, 60);
      ctx.lineWidth = 1;
      for (const n of nodes) {
        if (!n.hub) continue;
        const a = (opts.nodeAlpha + n.flash * 0.3) * n.dim + n.f * 0.3 * Math.max(n.dim, 0.55);
        const s = 5.5 + n.flash * 1.5 + n.f * 2;
        ctx.fillStyle = 'rgba(10,10,10,1)';
        ctx.strokeStyle = `rgba(${INK},${(a * 0.85).toFixed(3)})`;
        roundRect(n.x - s / 2, n.y - s / 2, s, s, 1.4);
        ctx.fill(); ctx.stroke();
      }
      if (anyFlash) {
        for (const n of nodes) {
          if (n.flash <= 0.02) continue;
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

      if (probeOn) {
        // o ponteiro vira um nó: fios finos até os 5 nós mais próximos
        const reachLinks = Rn * 0.85, near = [];
        for (const n of nodes) {
          const d = Math.hypot(n.x - probe.x, n.y - probe.y);
          if (d < reachLinks) near.push([d, n]);
        }
        near.sort((p, q) => p[0] - q[0]);
        ctx.lineWidth = 1;
        for (let i = 0; i < Math.min(5, near.length); i++) {
          const [d, n] = near[i];
          const al = 0.42 * smooth(1 - d / reachLinks) * probe.a * Math.max(n.dim, 0.5);
          if (al < 0.01) continue;
          ctx.strokeStyle = `rgba(${INK},${al.toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(probe.x, probe.y); ctx.lineTo(n.x, n.y); ctx.stroke();
        }
        ctx.fillStyle = `rgba(${INK},${(0.6 * probe.a).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(probe.x, probe.y, 2 + probe.press * 1.5, 0, Math.PI * 2); ctx.fill();
        if (!probe.real || probe.touch) {   // sem cursor do sistema: um anel mostra onde está
          ctx.strokeStyle = `rgba(${INK},${(0.3 * probe.a).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(probe.x, probe.y, 8 + Math.sin(lastT / 320) * 1.5, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // ondas de clique/toque
      for (const r of ripples) {
        const life = 1 - r.t / RIPPLE_LIFE;
        if (life <= 0) continue;
        ctx.strokeStyle = `rgba(${INK},${(0.3 * life * Math.max(dimAt(r.x, r.y), 0.5)).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.t * RIPPLE_SPEED, 0, Math.PI * 2); ctx.stroke();
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
      rafId = null;
      if (!visible || document.hidden || quality >= 2) return;
      rafId = requestAnimationFrame(frame);

      // teto de quadros: ~60/s no nível completo (telas de 120/144 Hz não dobram o trabalho), 30/s no leve
      const gap = lastDraw ? time - lastDraw : 0;
      if (lastDraw && gap < (quality === 0 ? 12 : 30)) return;

      const t0 = performance.now();
      const dt = Math.min(0.05, gap ? gap / 1000 : 0.016);
      lastDraw = time; lastT = time;
      update(time, dt);
      draw();
      const work = performance.now() - t0;

      // saúde dos quadros: se demoram demais por um bom tempo, simplifica (ignora aquecimento e retomadas)
      if (!gap || gap > 200 || warm < 20) { warm++; slow = 0; return; }
      const target = quality === 0 ? 16.7 : 33.3;
      if (gap > target * 1.6 || work > 12) slow++; else slow = Math.max(0, slow - 2);
      if (slow >= 36) { slow = 0; warm = 0; degrade(); }
    }
    function start() {
      if (reduceMotion || quality >= 2) { update(lastT, 0); draw(); return; }
      if (rafId === null && visible && !document.hidden) { lastDraw = 0; rafId = requestAnimationFrame(frame); }
    }

    /* ---------- tamanho ---------- */
    let builtW = 0, builtH = 0, builtQ = -1;
    function resize(force) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, quality === 0 ? 1.5 : 1);
      W = w; H = h;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // só recria a rede se a largura mudou ou a altura mudou de verdade
      // (evita "pulo" quando a barra do navegador no celular some/aparece)
      if (force === true || Math.abs(W - builtW) > 1 || Math.abs(H - builtH) > 120 || builtQ !== quality || !nodes.length) {
        build(); builtW = W; builtH = H; builtQ = quality;
      }
      measureAvoid();
      update(lastT, 0);
      draw();
    }

    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, nodes.length ? 120 : 0);
    });
    ro.observe(canvas);
    if (opts.avoid) ro.observe(opts.avoid);

    /* ---------- eventos do ponteiro ---------- */
    const host = opts.host || canvas.parentElement;
    if (opts.interactive && !reduceMotion && host) {
      const NO_DRAG = 'a,button,input,select,textarea,label,h1,h2,h3,h4,p,li,span,summary';
      const track = (e) => {
        if (quality >= 2) return;
        if (!probe.real) probe.snap = true;           // primeira entrada: sem deslizar de longe
        probe.cx = e.clientX; probe.cy = e.clientY;
        probe.touch = e.pointerType === 'touch';
        probe.real = true;
      };
      host.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' && !probe.down) return;
        track(e);
      }, { passive: true });
      host.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') probe.real = false; }, { passive: true });
      host.addEventListener('pointerdown', (e) => {
        if (e.button > 0 || quality >= 2) return;
        track(e);
        probe.down = true;
        const r = canvas.getBoundingClientRect();
        ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: 0 });
        if (ripples.length > 4) ripples.shift();
        // arrastar no fundo não seleciona o texto da seção (começando num texto, seleciona normal)
        if (e.pointerType !== 'touch' && !(e.target.closest && e.target.closest(NO_DRAG))) host.classList.add('is-dragging');
      }, { passive: true });
      const release = (e) => {
        probe.down = false;
        host.classList.remove('is-dragging');
        if (e.pointerType === 'touch') probe.real = false;
      };
      window.addEventListener('pointerup', release, { passive: true });
      window.addEventListener('pointercancel', release, { passive: true });
    }

    resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureAvoid(); });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { visible = entry.isIntersecting; if (visible) start(); });
    }, { threshold: 0.02 });
    io.observe(canvas);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

    // o nível de qualidade mudou (alguma instância viu a máquina engasgar): todas simplificam
    instances.add({
      applyQuality() {
        probe.real = false; probe.down = false; ripples = [];
        for (const n of nodes) { n.ox = n.oy = n.ovx = n.ovy = 0; n.rest = true; n.f = 0; }
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        resize(true);                // recria com a resolução e as camadas do novo nível
        slow = 0; warm = 0;
        if (quality < 2) start();    // no nível 2 fica o quadro estático desenhado pelo resize
      }
    });

    return { refresh: resize };
  }

  window.EGM_initNodeGraph = initNodeGraph;
})();
