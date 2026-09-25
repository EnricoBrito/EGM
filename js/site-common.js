(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- rolagem até a seção, parando exatamente embaixo do menu ----------
     1) clique num link da mesma página: calcula a posição na hora do clique;
     2) chegando de outra página (ex.: ../#sobre): os trabalhos e os passos
        carregam depois e empurram a seção pra baixo, então a posição é
        corrigida quando esse conteúdo termina de carregar (a menos que a
        pessoa já tenha rolado por conta própria). */
  const navEl = document.getElementById('nav');
  const navH = () => (navEl ? navEl.offsetHeight : 0);
  const setNavVar = () => document.documentElement.style.setProperty('--nav-h', navH() + 'px');
  setNavVar();
  window.addEventListener('resize', setNavVar);

  function targetOf(hash) {
    if (!hash || hash.length < 2) return null;
    try { return document.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) { return null; }
  }
  function scrollToTarget(el, smooth) {
    const y = el.getBoundingClientRect().top + window.scrollY - navH();
    window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: smooth && !reduceMotion ? 'smooth' : 'instant' });
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a || a.target === '_blank') return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname !== location.pathname || !u.hash) return;
    const el = targetOf(u.hash);
    if (!el) return;
    e.preventDefault();
    if (location.hash !== u.hash) history.pushState(null, '', u.hash);
    scrollToTarget(el, true);
  });

  let userScrolled = false;
  ['wheel', 'touchmove', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { userScrolled = true; }, { passive: true, once: true }));
  window.EGM_realign = function () {
    if (userScrolled) return;
    const el = targetOf(location.hash);
    if (el) scrollToTarget(el, false);
  };
  if (location.hash) {
    window.addEventListener('load', window.EGM_realign);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(window.EGM_realign);
  }

  /* ---------- ano no rodapé ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- menu mobile ---------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav__links');
  if (navToggle && navLinks) {
    const setOpen = (open) => {
      navLinks.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    };
    navToggle.addEventListener('click', () => setOpen(!navLinks.classList.contains('is-open')));
    navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  }

  /* ---------- barra de progresso de rolagem ---------- */
  const progressBar = document.getElementById('scrollProgress');
  if (progressBar) {
    const updateProgress = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      progressBar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    };
    window.addEventListener('scroll', () => requestAnimationFrame(updateProgress), { passive: true });
    updateProgress();
  }

  /* ---------- node graph do rodapé ---------- */
  if (window.EGM_initNodeGraph) {
    const footerCanvas = document.getElementById('nodegraphFooter');
    if (footerCanvas) window.EGM_initNodeGraph(footerCanvas, { cellsAcross: 14, spacing: [60, 96], lineAlpha: 0.16, nodeAlpha: 0.5, pulses: false, depth: false, seed: 3 });
  }

  /* ---------- CTA flutuante "Pedir orçamento" ----------
     Aparece depois do hero e sai de cena quando o banner de
     orçamento ou o rodapé entram na tela (não cobre o que já é
     a mesma chamada). */
  const floatCta = document.getElementById('floatCta');
  if (floatCta) {
    const hero = document.querySelector('.hero, .trabalho-hero, .doc-hero');
    const showAfter = () => (hero ? hero.offsetHeight * 0.6 : 400);
    const updateFloatCta = () => floatCta.classList.toggle('is-visible', window.scrollY > showAfter());
    window.addEventListener('scroll', () => requestAnimationFrame(updateFloatCta), { passive: true });
    updateFloatCta();

    const parkers = document.querySelectorAll('.calc-promo, .footer, .trabalho-cta, .doc-cta');
    const inView = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) inView.add(e.target); else inView.delete(e.target); });
      floatCta.classList.toggle('is-parked', inView.size > 0);
    }, { threshold: 0.01 });
    parkers.forEach((el) => io.observe(el));
  }
})();
