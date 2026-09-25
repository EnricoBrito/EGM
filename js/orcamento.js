(function () {
  'use strict';

  /*
   * Página de orçamento: coleta o pedido e abre o WhatsApp com a
   * mensagem pronta e organizada. Nenhum valor é calculado nem
   * exibido: a proposta é montada pela equipe depois.
   *
   * Aceita ?servico=bot,sistema pra já vir com serviços marcados
   * (usado pelos botões "Pedir orçamento" do site) e ?ref=id-do-trabalho.
   */
  const WHATSAPP_NUMBER = '5511942544758';
  const CASES = { 'smart-auto': 'Smart Auto Veículos', 'plus-camas': 'Plus Camas e Colchões' };

  const form = document.getElementById('orcForm');
  const resumoEl = document.getElementById('orcResumo');
  const msgEl = document.getElementById('orcMsg');
  const waBtn = document.getElementById('orcWhatsapp');
  const nomeInput = document.getElementById('fNome');
  const servicosStep = document.getElementById('stepServicos');

  const others = Array.from(document.querySelectorAll('#orcOptions input[name="servicos"]'));
  const unsure = form.querySelector('input[name="servicos"][value="indefinido"]');
  const unsureCard = document.getElementById('unsureCard');
  const unsureText = unsureCard.querySelector('small');

  /* ---------- pré-seleção vinda de outros botões do site ---------- */
  const params = new URLSearchParams(location.search);
  const ref = params.get('ref');
  const pre = (params.get('servico') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (pre.length) {
    const wantsUnsure = pre.includes('indefinido');
    others.forEach((cb) => { if (!wantsUnsure && pre.includes(cb.value)) cb.checked = true; });
    if (wantsUnsure) unsure.checked = true;
  }

  /* ---------- "Ainda não sei" não combina com os outros serviços ----------
     Com algum serviço marcado, "Ainda não sei" fica bloqueado.
     Com "Ainda não sei" marcado, os serviços ficam bloqueados. */
  function syncExclusive() {
    const anyOther = others.some((cb) => cb.checked);
    unsure.disabled = anyOther;
    unsureCard.classList.toggle('is-locked', anyOther);
    if (anyOther) unsureText.textContent = unsureText.dataset.locked;
    else if (unsure.checked) unsureText.textContent = 'Pra escolher serviços específicos, desmarque esta opção.';
    else unsureText.textContent = unsureText.dataset.default;

    others.forEach((cb) => {
      cb.disabled = unsure.checked;
      cb.closest('.toggle-card').classList.toggle('is-locked', unsure.checked);
    });
  }

  const val = (name) => (form.elements[name] ? String(form.elements[name].value || '').trim() : '');
  const checked = (name) => Array.from(form.querySelectorAll(`input[name="${name}"]:checked`));

  function collect() {
    return {
      servicos: checked('servicos').map((cb) => ({ id: cb.value, label: cb.dataset.label })),
      nome: val('nome'),
      empresa: val('empresa'),
      segmento: val('segmento'),
      pais: val('pais'),
      cidade: val('cidade'),
      hoje: checked('hoje').map((cb) => cb.value),
      prazo: (checked('prazo')[0] || {}).value || '',
      descricao: val('descricao')
    };
  }
  const local = (d) => [d.cidade, d.pais].filter(Boolean).join(', ');

  /* ---------- mensagem do WhatsApp ----------
     Só texto, sem emoji: o WhatsApp de computador (principalmente no
     Windows) troca emoji vindo de link por "�". Títulos em negrito
     (*TÍTULO* no WhatsApp) e só entram as partes que foram preenchidas. */
  const clean = (t) => t.replace(/\s+/g, ' ').trim();
  function buildMessage(d) {
    const L = [];
    const bloco = (titulo, linhas) => { if (linhas.length) L.push('', `*${titulo}*`, ...linhas); };

    L.push('Olá, equipe EGM.');
    L.push('Gostaria de solicitar um orçamento.');

    bloco('SERVIÇOS DE INTERESSE', d.servicos.map((s) => `- ${s.label}`));
    bloco('DADOS DA EMPRESA', [
      `Nome: ${clean(d.nome)}`,
      d.empresa && `Empresa: ${clean(d.empresa)}`,
      d.segmento && `Ramo: ${d.segmento}`,
      local(d) && `Local: ${clean(local(d))}`
    ].filter(Boolean));
    bloco('SITUAÇÃO ATUAL', d.hoje.map((h) => `- ${h}`));
    bloco('PRAZO DESEJADO', d.prazo ? [d.prazo] : []);
    bloco('O QUE PRECISA RESOLVER', d.descricao ? [d.descricao.trim()] : []);

    L.push('', ref ? `Pedido enviado pelo site da EGM, a partir do trabalho da ${CASES[ref] || ref}.` : 'Pedido enviado pelo site da EGM.');
    return L.join('\n');
  }

  /* ---------- resumo na tela ---------- */
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const row = (k, v) => `<div class="orc-resumo__row"><dt>${k}</dt><dd${v ? '' : ' class="is-empty"'}>${v ? esc(v) : '—'}</dd></div>`;

  function missing(d) {
    const out = [];
    if (!d.servicos.length) out.push('escolher pelo menos uma opção no passo 1');
    if (!d.nome) out.push('colocar o seu nome');
    return out;
  }

  function update() {
    syncExclusive();
    const d = collect();
    resumoEl.innerHTML =
      row('Serviços', d.servicos.map((s) => (s.id === 'indefinido' ? 'Ainda não sei' : s.label)).join(', ')) +
      row('Nome', d.nome) +
      row('Empresa', d.empresa) +
      row('Ramo', d.segmento) +
      row('Local', local(d)) +
      row('Prazo', d.prazo);

    waBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildMessage(d))}`;

    const ready = missing(d).length === 0;
    waBtn.classList.toggle('is-pending', !ready);
    if (ready && msgEl.textContent) msgEl.textContent = '';
    if (d.nome) nomeInput.removeAttribute('aria-invalid');
    if (d.servicos.length) servicosStep.classList.remove('is-invalid');
  }

  function guard(e) {
    const d = collect();
    const falta = missing(d);
    if (!falta.length) return;
    e.preventDefault();
    msgEl.textContent = `Pra enviar, falta ${falta.join(' e ')}.`;
    if (!d.servicos.length) servicosStep.classList.add('is-invalid');
    if (!d.nome) nomeInput.setAttribute('aria-invalid', 'true');
    const first = !d.servicos.length ? servicosStep : nomeInput;
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (first === nomeInput) setTimeout(() => nomeInput.focus({ preventScroll: true }), 350);
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => { e.preventDefault(); guard(e); if (!missing(collect()).length) waBtn.click(); });
  waBtn.addEventListener('click', guard);

  update();
})();
