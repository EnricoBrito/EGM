(function () {
  'use strict';

  const SERVICE_LABELS = { bot: 'Bot + IA', trafego: 'Tráfego Pago', 'google-ads': 'Google Ads', sistema: 'Sistema', site: 'Site', relatorios: 'Relatórios' };
  const IMG_PLACEHOLDER_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="8" width="40" height="32" rx="2"/><circle cx="16" cy="18" r="3"/><path d="M4 34 L18 22 L26 30 L34 22 L44 32"/></svg>`;

  const content = document.getElementById('trabalhoContent');
  const id = new URLSearchParams(location.search).get('id');

  Promise.all([
    fetch('data/projects.json').then((r) => r.json()),
    fetch('data/company.json').then((r) => r.json())
  ])
    .then(([projects, company]) => {
      const project = projects.find((p) => p.id === id);
      if (!project) {
        content.innerHTML = `
          <section class="trabalho-hero">
            <div class="section-inner">
              <a href="index.html#trabalhos" class="trabalho-back">← todos os trabalhos</a>
              <h1 class="section-title">Não achamos esse trabalho.</h1>
              <p class="section-lead">O link pode estar errado ou desatualizado. <a href="index.html#trabalhos" class="doc-inline-link">Veja todos os trabalhos</a>.</p>
            </div>
          </section>`;
        return;
      }

      document.title = `${project.nome} | EGM`;

      const template = document.getElementById('trabalhoTemplate');
      const node = template.content.cloneNode(true);

      node.querySelector('[data-field="categoria"]').textContent = '/// ' + project.categoria;
      node.querySelector('[data-field="nome"]').textContent = project.nome;
      node.querySelector('[data-field="tags"]').innerHTML = project.services
        .map((s) => `<span>${SERVICE_LABELS[s] || s}</span>`).join('');

      node.querySelector('[data-field="prazoProducao"]').textContent = company.prazoProducao;
      node.querySelector('[data-field="prazoImplantacao"]').textContent = company.prazoImplantacao;

      node.querySelector('[data-field="summary"]').textContent = project.summary;
      node.querySelector('[data-field="detail"]').textContent = project.detail;
      node.querySelector('[data-field="metric"]').textContent = '// ' + project.metric;

      const waText = `Olá! Vi o case da ${project.nome} no site da EGM e queria algo parecido pro meu negócio.`;
      node.querySelector('[data-field="whatsapp"]').href = `https://wa.me/${company.whatsapp}?text=${encodeURIComponent(waText)}`;

      content.innerHTML = '';
      content.appendChild(node);

      renderGallery(project);
    })
    .catch((err) => {
      console.error('EGM: falha ao carregar o trabalho.', err);
      content.innerHTML = '<p class="trabalho-loading section-inner">Não foi possível carregar os dados. Se você abriu este arquivo direto do disco, rode um servidor local (ex: <code>python -m http.server</code>).</p>';
    });

  /* ---------------------------------------------------------
     GALLERY — checks assets/trabalhos/{id}-{n}.png (or .jpg)
     for each slot. If the file exists, shows the real photo;
     if not, keeps the reserved placeholder. Drop the file in
     with the right name and it appears automatically — no code
     change needed.
  --------------------------------------------------------- */
  function tryLoadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function resolveGalleryImage(id, n) {
    return (await tryLoadImage(`assets/trabalhos/${id}-${n}.png`))
      || (await tryLoadImage(`assets/trabalhos/${id}-${n}.jpg`));
  }

  async function renderGallery(project) {
    const galleryEl = document.querySelector('[data-field="gallery"]');
    if (!galleryEl) return;

    const resolved = await Promise.all(
      project.gallery.map((label, i) => resolveGalleryImage(project.id, i + 1).then((src) => ({ label, src })))
    );

    galleryEl.innerHTML = resolved.map(({ label, src }) => src
      ? `<div class="trabalho-gallery__tile trabalho-gallery__tile--photo">
           <img src="${src}" alt="${label}" loading="lazy">
           <span>${label}</span>
         </div>`
      : `<div class="trabalho-gallery__tile">
           ${IMG_PLACEHOLDER_ICON}
           <span>${label}</span>
         </div>`
    ).join('');

    initLightbox(resolved.filter((item) => item.src), galleryEl);
  }

  /* ---------------------------------------------------------
     LIGHTBOX — click a real photo to see it full-size, with
     prev/next between the other resolved photos in this gallery
  --------------------------------------------------------- */
  function initLightbox(photos, galleryEl) {
    if (!photos.length) return;
    const lightbox = document.getElementById('lightbox');
    const imgEl = document.getElementById('lightboxImg');
    const captionEl = document.getElementById('lightboxCaption');
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');
    let current = 0;

    function show(i) {
      current = (i + photos.length) % photos.length;
      imgEl.src = photos[current].src;
      imgEl.alt = photos[current].label;
      captionEl.textContent = photos[current].label;
      const multiple = photos.length > 1;
      prevBtn.hidden = !multiple;
      nextBtn.hidden = !multiple;
    }
    function open(i) {
      show(i);
      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      lightbox.classList.remove('is-open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    galleryEl.querySelectorAll('.trabalho-gallery__tile--photo').forEach((tile, i) => {
      tile.addEventListener('click', () => open(i));
    });
    lightbox.querySelectorAll('[data-lightbox-close]').forEach((el) => el.addEventListener('click', close));
    prevBtn.addEventListener('click', () => show(current - 1));
    nextBtn.addEventListener('click', () => show(current + 1));
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });
  }
})();
