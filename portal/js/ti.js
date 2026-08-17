(function () {
  'use strict';

  const P = EGMPortal;
  let USERS = [], CLIENTES = [], CHAMADOS = [];

  EGMPortal.loadAll().then(({ users, clientes, chamados }) => {
    const sessionUser = EGMPortal.getSessionUser(users);
    if (!sessionUser || sessionUser.role !== 'ti') { location.href = 'login.html?role=ti'; return; }

    USERS = users;
    CLIENTES = clientes;
    CHAMADOS = chamados;
    document.getElementById('topbarUser').textContent = sessionUser.email;

    renderAll();
    initClientModal();
    initSql();
  }).catch((err) => {
    console.error('EGM portal:', err);
    document.getElementById('portalMain').innerHTML = '<p class="portal-note">Não foi possível carregar os dados do portal. Rode isso via servidor local (ex: <code>python -m http.server</code>) em vez de abrir o arquivo direto do disco.</p>';
  });

  function renderAll() {
    renderStats();
    renderClients();
    renderTickets();
    renderReports();
  }

  /* ---------- stats ---------- */
  function renderStats() {
    const total = CLIENTES.length;
    const ativos = CLIENTES.filter((c) => c.status === 'ativo').length;
    const atrasados = CLIENTES.filter((c) => c.pagamento === 'atrasado').length;
    const abertos = CHAMADOS.filter((t) => t.status !== 'resolvido').length;
    document.getElementById('statGrid').innerHTML = [
      { label: 'clientes', value: total },
      { label: 'ativos', value: ativos, cls: 'is-signal' },
      { label: 'pagamento atrasado', value: atrasados, cls: atrasados > 0 ? 'is-danger' : '' },
      { label: 'chamados em aberto', value: abertos, cls: abertos > 0 ? 'is-danger' : '' }
    ].map((s) => `<div class="stat-card"><p class="stat-card__label">${s.label}</p><p class="stat-card__value ${s.cls || ''}">${s.value}</p></div>`).join('');
  }

  /* ---------- clientes ---------- */
  function hasPortalAccess(clienteId) { return USERS.some((u) => u.role === 'cliente' && u.clienteId === clienteId); }

  function renderClients() {
    const statusBadge = { ativo: 'badge--ok', pausado: 'badge--warn', cancelado: 'badge--bad' };
    const pagBadge = { em_dia: 'badge--ok', atrasado: 'badge--bad', cancelado: 'badge--bad' };
    const tbody = document.querySelector('#clientsTable tbody');
    tbody.innerHTML = CLIENTES.map((c) => `
      <tr>
        <td>
          <strong>${P.escapeHtml(c.nome)}</strong><br>
          <span class="cell-mono">${hasPortalAccess(c.id) ? 'acesso ao portal ✓' : 'sem login no portal'}</span>
        </td>
        <td><span class="badge ${statusBadge[c.status] || ''}">${P.LABELS.status[c.status] || c.status}</span></td>
        <td><span class="badge ${pagBadge[c.pagamento] || ''}">${P.LABELS.pagamento[c.pagamento] || c.pagamento}</span></td>
        <td class="cell-mono">${P.currency(c.planoValorMensal)}/mês</td>
        <td class="cell-mono">${c.sistemas.map((s) => s.nome).join(', ') || 'nenhum'}</td>
        <td class="cell-mono">${P.formatDate(c.inicioContrato)}</td>
        <td><button class="row-action" data-edit="${c.id}">editar</button></td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openClientModal(btn.dataset.edit)));
  }

  /* ---------- chamados ---------- */
  function renderTickets() {
    const clienteNome = (id) => (CLIENTES.find((c) => c.id === id) || {}).nome || id;
    const urgBadge = { alta: 'badge--bad', media: 'badge--warn', baixa: '' };
    const tbody = document.querySelector('#ticketsTable tbody');
    if (!CHAMADOS.length) { tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum chamado.</td></tr>'; return; }
    tbody.innerHTML = CHAMADOS.slice().reverse().map((t) => `
      <tr>
        <td class="cell-mono">${t.id}</td>
        <td>${P.escapeHtml(clienteNome(t.clienteId))}</td>
        <td>${P.escapeHtml(t.titulo)}</td>
        <td><span class="badge ${urgBadge[t.urgencia] || ''}">${P.LABELS.urgencia[t.urgencia] || t.urgencia}</span></td>
        <td>
          <select class="cell-mono" data-status="${t.id}" style="background:transparent;border:1px solid var(--line);border-radius:var(--radius);padding:.3em .5em;">
            <option value="aberto" ${t.status === 'aberto' ? 'selected' : ''}>Aberto</option>
            <option value="em_andamento" ${t.status === 'em_andamento' ? 'selected' : ''}>Em andamento</option>
            <option value="resolvido" ${t.status === 'resolvido' ? 'selected' : ''}>Resolvido</option>
          </select>
        </td>
        <td class="cell-mono">${P.formatDateTime(t.criadoEm)}</td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-status]').forEach((sel) => sel.addEventListener('change', () => {
      const t = CHAMADOS.find((x) => x.id === sel.dataset.status);
      if (t) { t.status = sel.value; renderStats(); }
    }));
  }

  /* ---------- reports ---------- */
  function renderReports() {
    const days = 14;
    const perClient = CLIENTES.map((c) => P.generateMessageStats(c.id, 30));
    const totals14 = Array.from({ length: days }, (_, i) => {
      const idx = 30 - days + i;
      const data = perClient[0] ? perClient[0][idx].data : '';
      const quantidade = perClient.reduce((sum, stats) => sum + stats[idx].quantidade, 0);
      return { data, quantidade };
    });
    renderBarChart(document.getElementById('messageChart'), totals14);
    document.getElementById('totalMessages').textContent = totals14.reduce((s, d) => s + d.quantidade, 0).toLocaleString('pt-BR') + ' no período';

    const ranking = CLIENTES.map((c, i) => {
      const total = perClient[i].reduce((s, d) => s + d.quantidade, 0);
      return { nome: c.nome, total, media: Math.round(total / 30) };
    }).sort((a, b) => b.total - a.total);

    document.querySelector('#rankingTable tbody').innerHTML = ranking.map((r) => `
      <tr><td>${P.escapeHtml(r.nome)}</td><td class="cell-mono">${r.total.toLocaleString('pt-BR')}</td><td class="cell-mono">${r.media}/dia</td></tr>`).join('');
  }

  function renderBarChart(svg, data) {
    const W = 640, H = 220, padBottom = 24, padTop = 10;
    const max = Math.max(1, ...data.map((d) => d.quantidade));
    const barW = W / data.length;
    let html = '';
    data.forEach((d, i) => {
      const h = ((H - padBottom - padTop) * d.quantidade) / max;
      const x = i * barW + barW * 0.2;
      const y = H - padBottom - h;
      const w = barW * 0.6;
      const day = d.data ? new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
      html += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"></rect>`;
      html += `<text class="bar-value" x="${(x + w / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle">${d.quantidade}</text>`;
      if (i % 2 === 0) html += `<text class="axis-label" x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${day}</text>`;
    });
    svg.innerHTML = html;
  }

  /* ---------- modal: cadastrar/editar cliente ---------- */
  const modal = document.getElementById('clientModal');
  function openClientModal(id) {
    const form = document.getElementById('clientForm');
    form.reset();
    document.getElementById('cfId').value = id || '';
    document.getElementById('modalFormTitle').textContent = id ? 'editar_cliente()' : 'cadastrar_cliente()';
    if (id) {
      const c = CLIENTES.find((x) => x.id === id);
      document.getElementById('cfNome').value = c.nome;
      document.getElementById('cfPlano').value = c.planoValorMensal;
      document.getElementById('cfStatus').value = c.status;
      document.getElementById('cfPagamento').value = c.pagamento;
    }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeClientModal() { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); }
  function initClientModal() {
    document.getElementById('newClientBtn').addEventListener('click', () => openClientModal(null));
    modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeClientModal));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeClientModal(); });

    document.getElementById('clientForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('cfId').value;
      const nome = document.getElementById('cfNome').value.trim();
      const plano = Number(document.getElementById('cfPlano').value) || 0;
      const status = document.getElementById('cfStatus').value;
      const pagamento = document.getElementById('cfPagamento').value;
      const sistemaNome = document.getElementById('cfSistemaNome').value.trim();

      if (id) {
        const c = CLIENTES.find((x) => x.id === id);
        Object.assign(c, { nome, planoValorMensal: plano, status, pagamento });
        if (sistemaNome) c.sistemas.push({ id: 'sys-' + Date.now(), tipo: 'bot', nome: sistemaNome, status: 'online', promptResumo: null, ultimaAtualizacao: new Date().toISOString().slice(0, 10) });
      } else {
        const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('cliente-' + Date.now());
        CLIENTES.push({
          id: slug, nome, responsavel: '', status, pagamento, planoValorMensal: plano,
          inicioContrato: new Date().toISOString().slice(0, 10),
          sistemas: sistemaNome ? [{ id: 'sys-' + Date.now(), tipo: 'bot', nome: sistemaNome, status: 'online', promptResumo: null, ultimaAtualizacao: new Date().toISOString().slice(0, 10) }] : []
        });
      }
      closeClientModal();
      renderAll();
    });
  }

  /* ---------- console SQL ---------- */
  function initSql() {
    const input = document.getElementById('sqlInput');
    const runBtn = document.getElementById('sqlRunBtn');
    const resultEl = document.getElementById('sqlResult');
    const errorEl = document.getElementById('sqlError');
    const countEl = document.getElementById('sqlCount');

    const examples = [
      "SELECT * FROM clientes WHERE pagamento = 'atrasado'",
      "SELECT * FROM sistemas WHERE status = 'offline'",
      "SELECT * FROM chamados WHERE status != 'resolvido' ORDER BY criadoEm DESC",
      "SELECT clienteNome, quantidade FROM mensagens WHERE data = '" + new Date().toISOString().slice(0, 10) + "' ORDER BY quantidade DESC"
    ];
    document.getElementById('sqlExamples').innerHTML = examples.map((q, i) => `<button type="button" class="sql-chip" data-q="${i}">exemplo ${i + 1}</button>`).join('');
    document.querySelectorAll('.sql-chip').forEach((chip) => chip.addEventListener('click', () => { input.value = examples[chip.dataset.q]; execute(); }));

    function execute() {
      const tables = P.buildFlatTables({ clientes: CLIENTES, chamados: CHAMADOS }, 30);
      try {
        const { columns, rows, count } = EGMSql.run(input.value, tables);
        errorEl.style.display = 'none';
        countEl.textContent = `${count} linha${count === 1 ? '' : 's'}`;
        if (!rows.length) {
          resultEl.innerHTML = '<p class="table-empty">Nenhum resultado.</p>';
          return;
        }
        resultEl.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
          rows.map((r) => `<tr>${r.map((cell) => `<td>${P.escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
        }</tbody></table></div>`;
      } catch (err) {
        countEl.textContent = '';
        resultEl.innerHTML = '';
        errorEl.textContent = '✗ ' + err.message;
        errorEl.style.display = 'block';
      }
    }
    runBtn.addEventListener('click', execute);
    input.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') execute(); });
    execute();
  }
})();
