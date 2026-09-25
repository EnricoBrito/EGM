(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     NODE GRAPH — fundo do hero e do banner de orçamento
     (o do rodapé fica no site-common.js, compartilhado entre
     todas as páginas). No hero a rede "contorna" o texto: fica
     mais apagada atrás dele, então o título continua legível no
     celular sem perder o fundo.
  --------------------------------------------------------- */
  if (window.EGM_initNodeGraph) {
    window.EGM_initNodeGraph(document.getElementById('nodegraphHero'), {
      avoid: document.getElementById('heroContent'),
      avoidStrength: 0.72,
      cellsAcross: 17, cellsAcrossMobile: 6, spacing: [58, 92],
      maxLinks: 4, lineAlpha: 0.3, nodeAlpha: 0.8,
      seed: 11
    });
    window.EGM_initNodeGraph(document.getElementById('nodegraphCalcPromo'), {
      cellsAcross: 13, spacing: [64, 104], lineAlpha: 0.2, pulses: true, seed: 5,
      avoid: document.querySelector('.calc-promo__inner'), avoidStrength: 0.8
    });
  }

  /* ---------------------------------------------------------
     SCROLL REVEAL
  --------------------------------------------------------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  function makeRevealable(selector) {
    document.querySelectorAll(selector).forEach((el) => {
      el.classList.add('reveal');
      revealObserver.observe(el);
    });
  }

  /* ---------------------------------------------------------
     CARD TILT — cards de trabalho
  --------------------------------------------------------- */
  function attachTilt(el) {
    if (reduceMotion || window.matchMedia('(hover: none)').matches) return;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(700px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 5).toFixed(2)}deg) translateY(-2px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }

  makeRevealable('.service-card');
  makeRevealable('.about__intro');
  makeRevealable('.member');

  /* ---------------------------------------------------------
     EQUIPE — fotos em assets/{nome}.png (enrico, mateus, gustavo)
     Enquanto a foto não existir, fica o quadro com as iniciais.
  --------------------------------------------------------- */
  document.querySelectorAll('.member__photo img').forEach((img) => {
    const frame = img.closest('.member__photo');
    const markEmpty = () => { frame.classList.add('is-empty'); img.hidden = true; };
    const markLoaded = () => frame.classList.add('is-loaded');
    img.addEventListener('error', markEmpty);
    img.addEventListener('load', markLoaded);
    if (img.complete) { if (img.naturalWidth === 0) markEmpty(); else markLoaded(); }
  });

  /* ---------------------------------------------------------
     DADOS
  --------------------------------------------------------- */
  Promise.all([
    fetch('data/timeline.json').then((r) => r.json()),
    fetch('data/projects.json').then((r) => r.json()),
    fetch('data/services.json').then((r) => r.json())
  ])
    .then(([timeline, projects, services]) => {
      renderTimeline(timeline);
      renderPortfolio(projects);
      initServiceModals(services);
      // o conteúdo novo empurrou as seções: se a pessoa chegou com #secao, reposiciona
      requestAnimationFrame(() => window.EGM_realign && window.EGM_realign());
    })
    .catch((err) => {
      console.error('EGM: falha ao carregar dados JSON.', err);
      const grid = document.getElementById('portfolioGrid');
      if (grid) grid.innerHTML = '<p style="font-family:var(--font-mono);font-size:.85rem;color:var(--gray-600);padding:2rem;">Não foi possível carregar os dados. Se você abriu este arquivo direto do disco, rode um servidor local (ex: <code>python -m http.server</code>). Navegadores bloqueiam a leitura de JSON via file://.</p>';
    });

  /* ---------------------------------------------------------
     TIMELINE
  --------------------------------------------------------- */
  function renderTimeline(steps) {
    const container = document.getElementById('timeline');
    steps.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'timeline-step';
      el.innerHTML = `
        <span class="timeline-step__marker" aria-hidden="true"></span>
        <span class="timeline-step__num">${s.step}</span>
        <h3>${s.title}</h3>
        <p>${s.text}</p>`;
      container.appendChild(el);
    });

    const stepEls = container.querySelectorAll('.timeline-step');
    const stepObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); });
    }, { threshold: 0.4, rootMargin: '0px 0px -10% 0px' });
    stepEls.forEach((el) => stepObserver.observe(el));

    const fill = document.getElementById('timelineFill');
    function updateRail() {
      const rect = container.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height;
      const progressed = Math.min(Math.max(vh * 0.65 - rect.top, 0), total);
      fill.style.height = (total > 0 ? (progressed / total) * 100 : 0) + '%';
    }
    if (reduceMotion) {
      fill.style.height = '100%';
    } else {
      let ticking = false;
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => { updateRail(); ticking = false; });
          ticking = true;
        }
      }, { passive: true });
      updateRail();
    }
  }

  /* ---------------------------------------------------------
     TRABALHOS — todos os cards no mesmo formato; cada um leva
     pra página do trabalho (trabalhos/{id}/)
  --------------------------------------------------------- */
  const SERVICE_LABELS = { bot: 'Bot + IA', trafego: 'Tráfego Pago', 'google-ads': 'Google Ads', sistema: 'Sistema', site: 'Site', relatorios: 'Relatórios' };

  function renderPortfolio(projects) {
    const grid = document.getElementById('portfolioGrid');
    grid.innerHTML = '';
    projects.forEach((p) => {
      const card = document.createElement('a');
      card.href = `trabalhos/${encodeURIComponent(p.id)}/`;
      card.className = 'project-card';
      card.innerHTML = `
        <div class="project-card__top">
          <div>
            <h3>${p.nome}</h3>
            <p class="project-card__client">${p.categoria}</p>
          </div>
        </div>
        <p class="project-card__summary">${p.summary}</p>
        <div class="project-card__tags">${p.services.map((s) => `<span>${SERVICE_LABELS[s] || s}</span>`).join('')}</div>
        <span class="project-card__more">ver como foi feito →</span>`;
      grid.appendChild(card);
      attachTilt(card);
    });
    makeRevealable('.project-card');
  }

  /* ---------------------------------------------------------
     SERVIÇOS — janela "saiba mais", com atalho pro orçamento
     já com o serviço marcado. No celular abre de baixo pra cima.
  --------------------------------------------------------- */
  const modal = document.getElementById('infoModal');
  const modalCta = document.getElementById('modalCta');
  let lastFocus = null;

  function openModal(svc) {
    lastFocus = document.activeElement;
    document.getElementById('modalTitle').textContent = svc.name;
    document.getElementById('modalClient').textContent = svc.tagline;
    document.getElementById('modalDetail').textContent = svc.detail;
    document.getElementById('modalStack').innerHTML = svc.includes.map((c) => `<li>${c}</li>`).join('');
    modalCta.href = `orcamento/?servico=${encodeURIComponent(svc.id)}`;
    modalCta.textContent = `Pedir orçamento de ${svc.name}`;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modal.querySelector('.modal__close').focus();
  }
  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });

  function initServiceModals(services) {
    document.querySelectorAll('.service-card__more').forEach((btn) => {
      btn.addEventListener('click', () => {
        const svc = services.find((s) => s.id === btn.dataset.service);
        if (svc) openModal(svc);
      });
    });
  }

})();
