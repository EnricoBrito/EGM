(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- footer year ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- nav mobile toggle ---------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav__links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      navLinks.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }));
  }

  /* ---------- scroll progress bar ---------- */
  const progressBar = document.getElementById('scrollProgress');
  if (progressBar) {
    function updateProgress() {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      progressBar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    }
    window.addEventListener('scroll', () => requestAnimationFrame(updateProgress));
    updateProgress();
  }

  /* ---------- footer node graph ---------- */
  if (window.EGM_initNodeGraph) {
    const footerCanvas = document.getElementById('nodegraphFooter');
    if (footerCanvas) window.EGM_initNodeGraph(footerCanvas, { density: 0.00014, maxLinkDist: 160, speed: 0.11 });
  }

  /* ---------- floating calculator CTA ---------- */
  const floatCta = document.getElementById('floatCta');
  if (floatCta) {
    const hero = document.querySelector('.hero');
    const showAfter = hero ? hero.offsetHeight * 0.6 : 400;
    function updateFloatCta() {
      const past = window.scrollY > showAfter;
      floatCta.classList.toggle('is-visible', past);
    }
    window.addEventListener('scroll', () => requestAnimationFrame(updateFloatCta));
    updateFloatCta();
  }
})();
