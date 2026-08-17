(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     NODE GRAPH — hero background (footer graph is handled by
     site-common.js, shared across every page)
  --------------------------------------------------------- */
  if (window.EGM_initNodeGraph) {
    window.EGM_initNodeGraph(document.getElementById('nodegraphHero'), { density: 0.00022, maxLinkDist: 190, speed: 0.16 });
    window.EGM_initNodeGraph(document.getElementById('nodegraphCalcPromo'), { density: 0.00016, maxLinkDist: 170, speed: 0.13 });
  }

  /* ---------------------------------------------------------
     GENERIC SCROLL REVEAL
  --------------------------------------------------------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  function makeRevealable(selector) {
    document.querySelectorAll(selector).forEach((el) => {
      el.classList.add('reveal');
      revealObserver.observe(el);
    });
  }

  /* ---------------------------------------------------------
     CARD TILT — portfolio cards
  --------------------------------------------------------- */
  function attachTilt(el) {
    if (reduceMotion) return;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(700px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 5).toFixed(2)}deg) translateY(-2px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }

  makeRevealable('.service-card');
  makeRevealable('.manifesto__statement, .manifesto__body');

  /* ---------------------------------------------------------
     DATA LOADING
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
    })
    .catch((err) => {
      console.error('EGM: falha ao carregar dados JSON.', err);
      const grid = document.getElementById('portfolioGrid');
      if (grid) grid.innerHTML = '<p style="font-family:var(--font-mono);font-size:.85rem;color:var(--gray-600);">Não foi possível carregar os dados. Se você abriu este arquivo direto do disco, rode um servidor local (ex: <code>python -m http.server</code>). Navegadores bloqueiam a leitura de JSON via file://.</p>';
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
      });
      updateRail();
    }
  }

  /* ---------------------------------------------------------
     PORTFOLIO — cards now link through to a full case-study
     page (trabalho.html?id=...) instead of a modal, so there's
     room for a gallery, timeline and "how we built it" detail.
  --------------------------------------------------------- */
  const SERVICE_LABELS = { bot: 'Bot + IA', trafego: 'Tráfego Pago', 'google-ads': 'Google Ads', sistema: 'Sistema', site: 'Site', relatorios: 'Relatórios' };
  const FILTER_GROUP = { bot: 'bot', trafego: 'trafego', 'google-ads': 'trafego', sistema: 'sistema', site: 'site', relatorios: 'relatorios' };

  function renderPortfolio(projects) {
    const grid = document.getElementById('portfolioGrid');
    grid.innerHTML = '';
    projects.forEach((p) => {
      const filterGroups = Array.from(new Set(p.services.map((s) => FILTER_GROUP[s] || s)));
      const card = document.createElement('a');
      card.href = `trabalho.html?id=${encodeURIComponent(p.id)}`;
      card.dataset.categories = filterGroups.join(' ');
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

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach((b) => { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');
        const filter = btn.dataset.filter;
        document.querySelectorAll('.project-card').forEach((card) => {
          const cats = card.dataset.categories.split(' ');
          card.classList.toggle('is-hidden', filter !== 'all' && !cats.includes(filter));
        });
      });
    });
  }

  /* ---------------------------------------------------------
     SERVICES — "conheça mais" detail modal
  --------------------------------------------------------- */
  const modal = document.getElementById('infoModal');
  function openModal({ eyebrow, title, subtitle, detail, chips, metric }) {
    document.getElementById('modalCategory').textContent = eyebrow;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalClient').textContent = subtitle;
    document.getElementById('modalDetail').textContent = detail;
    document.getElementById('modalStack').innerHTML = chips.map((c) => `<span>${c}</span>`).join('');
    document.getElementById('modalMetric').textContent = metric;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });

  function initServiceModals(services) {
    document.querySelectorAll('.service-card__more').forEach((btn) => {
      btn.addEventListener('click', () => {
        const svc = services.find((s) => s.id === btn.dataset.service);
        if (!svc) return;
        openModal({
          eyebrow: '> ' + svc.eyebrow,
          title: svc.name,
          subtitle: svc.tagline,
          detail: svc.detail,
          chips: svc.includes,
          metric: '// 100% personalizado pro seu negócio'
        });
      });
    });
  }

})();
