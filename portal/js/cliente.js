(function () {
  'use strict';

  const P = EGMPortal;

  EGMPortal.loadAll().then(({ users, clientes, chamados }) => {
    const user = EGMPortal.getSessionUser(users);
    if (!user || user.role !== 'cliente') { location.href = 'login.html?role=cliente'; return; }

    const cliente = clientes.find((c) => c.id === user.clienteId);
    if (!cliente) { location.href = 'login.html?role=cliente'; return; }

    document.getElementById('topbarUser').textContent = cliente.nome;
    document.getElementById('pageTitle').textContent = `Olá, ${cliente.nome}`;
    document.getElementById('pageSubtitle').textContent =
      `Contrato desde ${P.formatDate(cliente.inicioContrato)} · plano ${P.currency(cliente.planoValorMensal)}/mês · pagamento ${P.LABELS.pagamento[cliente.pagamento] || cliente.pagamento}`;

    /* ---------- stats ---------- */
    const stats = P.generateMessageStats(cliente.id, 30);
    const hoje = stats[stats.length - 1].quantidade;
    const semana = stats.slice(-7).reduce((s, d) => s + d.quantidade, 0);
    const sistemasAtivos = cliente.sistemas.filter((s) => s.status === 'online').length;
    const meusChamadosSemente = chamados.filter((t) => t.clienteId === cliente.id);
    const chamadosAbertos = meusChamadosSemente.filter((t) => t.status === 'aberto').length;

    document.getElementById('statGrid').innerHTML = [
      { label: 'mensagens hoje', value: hoje },
      { label: 'mensagens (7 dias)', value: semana },
      { label: 'sistemas ativos', value: `${sistemasAtivos}/${cliente.sistemas.length}` },
      { label: 'chamados abertos', value: chamadosAbertos, cls: chamadosAbertos > 0 ? 'is-signal' : '' }
    ].map((s) => `
      <div class="stat-card">
        <p class="stat-card__label">${s.label}</p>
        <p class="stat-card__value ${s.cls || ''}">${s.value}</p>
      </div>`).join('');

    /* ---------- systems ---------- */
    const statusClass = { online: 'badge--ok', offline: 'badge--bad', manutencao: 'badge--warn' };
    const tipoLabel = { bot: 'Bot de WhatsApp', sistema: 'Sistema web', site: 'Site institucional' };
    document.getElementById('systemGrid').innerHTML = cliente.sistemas.map((s) => `
      <div class="system-card">
        <div class="system-card__top">
          <div>
            <p class="system-card__name">${P.escapeHtml(s.nome)}</p>
            <p class="system-card__type">${tipoLabel[s.tipo] || s.tipo}</p>
          </div>
          <span class="badge ${statusClass[s.status] || ''}">${P.LABELS.sistemaStatus[s.status] || s.status}</span>
        </div>
        ${s.promptResumo
          ? `<div class="system-card__prompt">${P.escapeHtml(s.promptResumo)}</div>`
          : `<div class="system-card__prompt">Sistema sem prompt de IA. É um painel/sistema web, não um bot conversacional.</div>`}
        <p class="system-card__meta">última atualização: ${P.formatDate(s.ultimaAtualizacao)}</p>
      </div>`).join('');

    /* ---------- chart ---------- */
    renderBarChart(document.getElementById('messageChart'), stats.slice(-14));
    document.getElementById('totalMessages').textContent =
      stats.slice(-14).reduce((s, d) => s + d.quantidade, 0).toLocaleString('pt-BR') + ' no período';

    /* ---------- ticket system select ---------- */
    const systemSelect = document.getElementById('ticketSystem');
    systemSelect.innerHTML = cliente.sistemas.map((s) => `<option value="${s.id}">${P.escapeHtml(s.nome)}</option>`).join('')
      + '<option value="geral">Assunto geral / outro</option>';

    /* ---------- tickets table ---------- */
    let meusChamados = meusChamadosSemente.slice();
    function renderTickets() {
      const tbody = document.querySelector('#ticketsTable tbody');
      if (!meusChamados.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum chamado ainda.</td></tr>`;
        return;
      }
      const statusBadge = { aberto: 'badge--warn', em_andamento: 'badge--warn', resolvido: 'badge--ok' };
      tbody.innerHTML = meusChamados.slice().reverse().map((t) => `
        <tr>
          <td class="cell-mono">${t.id}</td>
          <td>${P.escapeHtml(t.titulo)}</td>
          <td><span class="badge">${P.LABELS.urgencia[t.urgencia] || t.urgencia}</span></td>
          <td><span class="badge ${statusBadge[t.status] || ''}">${P.LABELS.chamadoStatus[t.status] || t.status}</span></td>
          <td class="cell-mono">${P.formatDateTime(t.criadoEm)}</td>
        </tr>`).join('');
    }
    renderTickets();

    /* ---------- ticket submission ---------- */
    const ticketForm = document.getElementById('ticketForm');
    const ticketMsg = document.getElementById('ticketMsg');

    function currentPayload() {
      const sysId = systemSelect.value;
      const sys = cliente.sistemas.find((s) => s.id === sysId);
      return {
        origem: 'portal-egm',
        cliente: cliente.nome,
        clienteId: cliente.id,
        sistema: sys ? sys.nome : 'Geral',
        titulo: document.getElementById('ticketTitle').value.trim() || '(sem título)',
        urgencia: document.getElementById('ticketUrgency').value,
        descricao: document.getElementById('ticketDesc').value.trim() || '(sem descrição)',
        protocolo: P.generateProtocol(),
        criado_em: new Date().toISOString()
      };
    }

    ticketForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('ticketSubmitBtn');
      const payload = currentPayload();
      submitBtn.disabled = true;
      ticketMsg.textContent = '> enviando chamado...';
      ticketMsg.className = 'form-msg is-loading';

      const result = await P.submitTicket(payload);
      meusChamados.push({ id: payload.protocolo, clienteId: cliente.id, titulo: payload.titulo, urgencia: payload.urgencia, status: 'aberto', criadoEm: payload.criado_em });
      renderTickets();

      if (result.ok) {
        ticketMsg.innerHTML = `✓ chamado <strong>${payload.protocolo}</strong> enviado. a gente te retorna em breve.`;
        ticketMsg.className = 'form-msg is-success';
        ticketForm.reset();
      } else {
        ticketMsg.innerHTML = `✗ o n8n não respondeu agora. Protocolo <strong>${payload.protocolo}</strong> gerado. <a href="${result.link}" target="_blank" rel="noopener" style="color:var(--dark-text); font-weight:600; border-bottom:1px dashed currentColor;">clique aqui pra mandar pronto no WhatsApp</a>.`;
        ticketMsg.className = 'form-msg is-error';
      }
      submitBtn.disabled = false;
    });

    document.getElementById('ticketWhatsappBtn').addEventListener('click', () => {
      const payload = currentPayload();
      window.open(P.buildWhatsAppTicketLink(payload), '_blank', 'noopener');
    });

  }).catch((err) => {
    console.error('EGM portal:', err);
    document.getElementById('portalMain').innerHTML = '<p class="portal-note">Não foi possível carregar os dados do portal. Rode isso via servidor local (ex: <code>python -m http.server</code>) em vez de abrir o arquivo direto do disco.</p>';
  });

  /* ---------- hand-rolled SVG bar chart ---------- */
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
      const day = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      html += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"></rect>`;
      html += `<text class="bar-value" x="${(x + w / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle">${d.quantidade}</text>`;
      if (i % 2 === 0) {
        html += `<text class="axis-label" x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${day}</text>`;
      }
    });
    svg.innerHTML = html;
  }
})();
