(function () {
  'use strict';

  const SERVICE_LABELS = { bot: 'Bot + IA', trafego: 'Tráfego Pago', 'google-ads': 'Google Ads', sistema: 'Sistema', site: 'Site', relatorios: 'Relatórios' };
  const IMG_PLACEHOLDER_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="8" width="40" height="32" rx="2"/><circle cx="16" cy="18" r="3"/><path d="M4 34 L18 22 L26 30 L34 22 L44 32"/></svg>`;

  const content = document.getElementById('trabalhoContent');
  // cada trabalho tem a própria pasta (trabalhos/{id}/) e diz qual é no <body>
  const ROOT = document.body.dataset.root || '';
  const id = document.body.dataset.project || new URLSearchParams(location.search).get('id');
  const url = (p) => (/^(https?:)?\/\//.test(p) || p.startsWith('/') ? p : ROOT + p);
  const $ = (root, field) => root.querySelector(`[data-field="${field}"]`);

  Promise.all([
    fetch(ROOT + 'data/projects.json').then((r) => r.json()),
    fetch(ROOT + 'data/company.json').then((r) => r.json())
  ])
    .then(([projects, company]) => {
      const project = projects.find((p) => p.id === id);
      if (!project) {
        content.innerHTML = `
          <section class="trabalho-hero">
            <div class="section-inner">
              <a href="${ROOT}#trabalhos" class="trabalho-back">← todos os trabalhos</a>
              <h1 class="section-title">Não achamos esse trabalho.</h1>
              <p class="section-lead">O link pode estar errado ou desatualizado. <a href="${ROOT}#trabalhos" class="doc-inline-link">Veja todos os trabalhos</a>.</p>
            </div>
          </section>`;
        return;
      }

      document.title = `${project.nome} | EGM`;

      const node = document.getElementById('trabalhoTemplate').content.cloneNode(true);

      $(node, 'categoria').textContent = project.categoria;
      $(node, 'nome').textContent = project.nome;
      $(node, 'tags').innerHTML = project.services.map((s) => `<span>${SERVICE_LABELS[s] || s}</span>`).join('');

      $(node, 'prazoProducao').textContent = company.prazoProducao;
      $(node, 'prazoImplantacao').textContent = company.prazoImplantacao;

      $(node, 'summary').textContent = project.summary;
      $(node, 'detail').textContent = project.detail;
      $(node, 'metric').textContent = project.metric;

      const waText = `Olá! Vi o trabalho da ${project.nome} no site da EGM e queria algo parecido pra minha empresa.`;
      $(node, 'whatsapp').href = `https://wa.me/${company.whatsapp}?text=${encodeURIComponent(waText)}`;
      const orcServices = project.services.slice();
      if (project.app && !orcServices.includes('sistema')) orcServices.push('sistema');
      $(node, 'orcamento').href = `${ROOT}orcamento/?servico=${encodeURIComponent(orcServices.join(','))}&ref=${encodeURIComponent(project.id)}`;

      if (project.entregas && project.entregas.length) {
        const el = $(node, 'entregas');
        el.hidden = false;
        el.innerHTML = project.entregas.map((e) => `
          <div class="trabalho-entrega">
            <h3>${SERVICE_LABELS[e.servico] || e.servico}</h3>
            <p>${e.texto}</p>
          </div>`).join('');
      }

      if (project.app) fillApp(node, project);

      content.innerHTML = '';
      content.appendChild(node);

      if (project.app) initAppTour(project.app);

      renderGallery(project);
    })
    .catch((err) => {
      console.error('EGM: falha ao carregar o trabalho.', err);
      content.innerHTML = '<p class="trabalho-loading section-inner">Não foi possível carregar os dados. Se você abriu este arquivo direto do disco, rode um servidor local (ex: <code>python -m http.server</code>).</p>';
    });

  /* ---------------------------------------------------------
     APLICATIVO — imagem pequena + zoom que passeia pela tela.
     Cada recurso do JSON tem um "foco" [x, y] em pixels da
     imagem (775x1606). O quadro de zoom mostra aquela parte da
     tela, e o celular pequeno marca onde ela fica. Troca sozinho
     a cada 5s até a pessoa tocar num recurso.
  --------------------------------------------------------- */
  const IMG_W = 775, IMG_H = 1606;
  const REGION_W = 664, REGION_H = Math.round(664 * 3 / 4);   // mesma proporção do quadro (4:3)
  const TOUR_MS = 5000;

  function fillApp(node, project) {
    const app = project.app;
    $(node, 'app').hidden = false;
    $(node, 'appTitulo').textContent = app.titulo;
    $(node, 'appDescricao').textContent = app.descricao;
    $(node, 'appWebp').setAttribute('srcset', url(app.imagemWebp));
    $(node, 'appImg').src = url(app.imagem);
    $(node, 'appMini').src = url(app.imagemWebpSm || app.imagem);
    $(node, 'appRecursos').innerHTML = app.recursos.map((r, i) => `
      <button type="button" class="app-tour__tab" role="tab" id="tab-${r.id}" aria-selected="${i === 0}" data-i="${i}">
        <span class="app-tour__bar" aria-hidden="true"></span>
        <strong>${r.titulo}</strong>
        <span>${r.texto}</span>
      </button>`).join('');
  }

  function initAppTour(app) {
    const tour = document.querySelector('.app-tour');
    if (!tour) return;
    const zoom = tour.querySelector('.app-tour__zoom');
    const img = tour.querySelector('.app-tour__zoom-img');
    const spot = tour.querySelector('.app-tour__spot');
    const tabs = Array.from(tour.querySelectorAll('.app-tour__tab'));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = 0, timer = null, auto = !reduce, visible = false;

    function region(i) {
      const [cx, cy] = app.recursos[i].foco;
      const x = Math.max(0, Math.min(IMG_W - REGION_W, cx - REGION_W / 2));
      const y = Math.max(0, Math.min(IMG_H - REGION_H, cy - REGION_H / 2));
      return { x, y };
    }

    function render() {
      const { x, y } = region(current);
      const scale = zoom.clientWidth / REGION_W;
      img.style.transform = `translate(${(-x * scale).toFixed(1)}px, ${(-y * scale).toFixed(1)}px) scale(${scale.toFixed(4)})`;
      spot.style.left = (x / IMG_W * 100) + '%';
      spot.style.top = (y / IMG_H * 100) + '%';
      spot.style.width = (REGION_W / IMG_W * 100) + '%';
      spot.style.height = (REGION_H / IMG_H * 100) + '%';
      zoom.setAttribute('aria-label', `${app.recursos[current].titulo}. Toque pra ver a tela inteira do aplicativo`);
      tabs.forEach((t, i) => {
        const on = i === current;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      // reinicia a barrinha de tempo do recurso ativo
      tabs[current].classList.remove('is-timing'); void tabs[current].offsetWidth;
      if (auto && visible) tabs[current].classList.add('is-timing');
    }

    function go(i) { current = (i + tabs.length) % tabs.length; render(); schedule(); }
    function schedule() {
      clearTimeout(timer);
      if (auto && visible) timer = setTimeout(() => go(current + 1), TOUR_MS);
    }
    function stopAuto() {
      auto = false; clearTimeout(timer);
      tour.classList.add('is-manual');
      tabs.forEach((t) => t.classList.remove('is-timing'));
    }

    tabs.forEach((t, i) => t.addEventListener('click', () => { stopAuto(); go(i); }));
    tour.querySelector('.app-tour__tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault(); stopAuto();
      go(current + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1));
      tabs[current].focus();
    });
    zoom.addEventListener('click', () => openLightbox([{ src: url(app.imagem), label: app.alt }], 0));

    new ResizeObserver(() => { tour.classList.add('is-resizing'); render(); requestAnimationFrame(() => tour.classList.remove('is-resizing')); }).observe(zoom);
    new IntersectionObserver((entries) => {
      entries.forEach((e) => { visible = e.isIntersecting; render(); schedule(); });
    }, { threshold: 0.5 }).observe(tour.querySelector('.app-tour__stage'));

    if (reduce) tour.classList.add('is-manual');
    render();
  }

  /* ---------------------------------------------------------
     GALERIA — procura assets/{prefixo}{n}.png (ou .jpg)
     Ex.: smart1.png, smart2.png, smart3.png / plus1.png ...
     O prefixo vem do campo "imagens" em data/projects.json.
     Se o arquivo existir, mostra a foto; se não, mantém o espaço
     reservado. É só colocar o arquivo com o nome certo.
  --------------------------------------------------------- */
  function tryLoadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function resolveGalleryImage(prefix, n) {
    return (await tryLoadImage(`${ROOT}assets/${prefix}${n}.png`))
      || (await tryLoadImage(`${ROOT}assets/${prefix}${n}.jpg`));
  }

  async function renderGallery(project) {
    const galleryEl = document.querySelector('[data-field="gallery"]');
    if (!galleryEl) return;
    const prefix = project.imagens || project.id;

    const resolved = await Promise.all(
      project.gallery.map((label, i) => resolveGalleryImage(prefix, i + 1).then((src) => ({ label, src })))
    );

    const photos = resolved.filter((item) => item.src);
    galleryEl.innerHTML = resolved.map(({ label, src }) => src
      ? `<button type="button" class="trabalho-gallery__tile trabalho-gallery__tile--photo" data-photo="${photos.findIndex((p) => p.src === src)}" aria-label="Ampliar: ${label}">
           <span class="trabalho-gallery__media"><img src="${src}" alt="${label}" loading="lazy" decoding="async"></span>
           <span class="trabalho-gallery__caption"><span>${label}</span><span class="trabalho-gallery__zoom" aria-hidden="true"></span></span>
         </button>`
      : `<div class="trabalho-gallery__tile">
           <span class="trabalho-gallery__media trabalho-gallery__media--empty">${IMG_PLACEHOLDER_ICON}</span>
           <span class="trabalho-gallery__caption"><span>${label}</span></span>
         </div>`
    ).join('');

    const note = document.querySelector('[data-field="galleryNote"]');
    if (note) note.hidden = photos.length === resolved.length;

    galleryEl.querySelectorAll('[data-photo]').forEach((tile) => {
      tile.addEventListener('click', () => openLightbox(photos, Number(tile.dataset.photo)));
    });
  }

  /* ---------------------------------------------------------
     LIGHTBOX — foto em tela cheia, com anterior/próxima
  --------------------------------------------------------- */
  const lightbox = document.getElementById('lightbox');
  const imgEl = document.getElementById('lightboxImg');
  const captionEl = document.getElementById('lightboxCaption');
  const prevBtn = document.getElementById('lightboxPrev');
  const nextBtn = document.getElementById('lightboxNext');
  let list = [], current = 0, lastFocus = null;

  function show(i) {
    current = (i + list.length) % list.length;
    imgEl.src = list[current].src;
    imgEl.alt = list[current].label;
    captionEl.textContent = list[current].label;
    const multiple = list.length > 1;
    prevBtn.hidden = !multiple;
    nextBtn.hidden = !multiple;
  }
  function openLightbox(items, i) {
    if (!items.length) return;
    list = items;
    lastFocus = document.activeElement;
    show(i);
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.getElementById('lightboxClose').focus();
  }
  function close() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  lightbox.querySelectorAll('[data-lightbox-close]').forEach((el) => el.addEventListener('click', close));
  prevBtn.addEventListener('click', () => show(current - 1));
  nextBtn.addEventListener('click', () => show(current + 1));
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft' && list.length > 1) show(current - 1);
    if (e.key === 'ArrowRight' && list.length > 1) show(current + 1);
  });
})();
