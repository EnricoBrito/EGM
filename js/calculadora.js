(function () {
  'use strict';

  const WHATSAPP_NUMBER = '5511942544758';

  function formatBRL(n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  function formatAOA(n) {
    return 'Kz ' + Math.round(n || 0).toLocaleString('pt-BR');
  }
  const FORMATTERS = { brl: formatBRL, aoa: formatAOA };
  const BALLPARK = { brl: 'R$ 2.000/mês', aoa: 'Kz 1.009.000/mês' };

  const optionsEl = document.getElementById('calcOptions');
  const monthlyEl = document.getElementById('calcMonthly');
  const setupEl = document.getElementById('calcSetup');
  const breakdownEl = document.getElementById('calcBreakdown');
  const whatsappBtn = document.getElementById('calcWhatsapp');
  const ballparkEl = document.getElementById('calcBallpark');
  const currencyButtons = document.querySelectorAll('.calc-currency__btn');

  let currency = 'brl';
  let CONFIG = null;

  fetch('data/calculator-config.json')
    .then((r) => r.json())
    .then((config) => {
      CONFIG = config;
      renderOptions();
      wireCurrencyToggle();
      recalculate();
    })
    .catch((err) => {
      console.error('EGM: falha ao carregar a config da calculadora.', err);
      optionsEl.innerHTML = '<p class="calc-options__loading">Não foi possível carregar as opções. Se você abriu este arquivo direto do disco, rode um servidor local (ex: <code>python -m http.server</code>) em vez de abrir o .html direto.</p>';
    });

  function renderOptions() {
    optionsEl.innerHTML = CONFIG.services.map((s) => `
      <label class="toggle-card">
        <input type="checkbox" value="${s.id}">
        <span class="toggle-card__box">
          <strong>${s.label}</strong>
          <small>${s.description}</small>
          <em data-price-for="${s.id}"></em>
        </span>
      </label>`).join('');
    optionsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener('change', recalculate));
    // pré-seleciona um combo típico só pra já mostrar algo em ação
    const defaults = ['bot', 'sistema', 'trafego'];
    optionsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { if (defaults.includes(cb.value)) cb.checked = true; });
  }

  function wireCurrencyToggle() {
    currencyButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        currency = btn.dataset.currency;
        currencyButtons.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        ballparkEl.textContent = BALLPARK[currency];
        recalculate();
      });
    });
  }

  function recalculate() {
    if (!CONFIG) return;
    const fmt = FORMATTERS[currency];
    const checkboxes = optionsEl.querySelectorAll('input[type="checkbox"]');
    const selected = Array.from(checkboxes)
      .filter((cb) => cb.checked)
      .map((cb) => CONFIG.services.find((s) => s.id === cb.value));

    // atualiza o preço mensal exibido em cada card, na moeda atual
    CONFIG.services.forEach((s) => {
      const el = optionsEl.querySelector(`[data-price-for="${s.id}"]`);
      if (el) el.textContent = `+ ${fmt(s.precos[currency].mensal)}/mês`;
    });

    const mensalTotal = selected.reduce((sum, s) => sum + s.precos[currency].mensal, 0);
    const implantacaoTotal = selected.reduce((sum, s) => sum + s.precos[currency].implantacao, 0);

    monthlyEl.textContent = fmt(mensalTotal);
    setupEl.textContent = fmt(implantacaoTotal);

    if (!selected.length) {
      breakdownEl.innerHTML = '<p class="calc-breakdown__empty">Selecione ao menos um serviço pra ver o cálculo.</p>';
    } else {
      breakdownEl.innerHTML = selected.map((s) => `
        <div class="calc-breakdown__row"><span>${s.label}</span><strong>${fmt(s.precos[currency].mensal)}/mês</strong></div>`).join('');
    }

    const resumo = selected.length ? selected.map((s) => s.label).join(', ') : 'nenhum serviço selecionado ainda';
    const moedaNome = currency === 'aoa' ? 'Kwanza (Angola)' : 'Real (Brasil)';
    const text = `Olá! Simulei um orçamento no site da EGM:\n` +
      `Moeda: ${moedaNome}\n` +
      `Serviços: ${resumo}\n` +
      `Mensalidade estimada: ${fmt(mensalTotal)}/mês\n` +
      `Implantação estimada: ${fmt(implantacaoTotal)}\n` +
      `Queria entender melhor como isso funcionaria pro meu negócio.`;
    whatsappBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }
})();
