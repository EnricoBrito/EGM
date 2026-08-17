/**
 * EGM Portal — shared helpers
 * Tudo aqui é MOCK: os dados vêm de arquivos JSON estáticos e o estado
 * de sessão trafega pela própria URL (?u=id), sem localStorage/sessionStorage
 * e sem backend real. Serve pra demonstrar a interface — a validação de
 * verdade (senha com hash, sessão de servidor, etc.) fica pro dia em que
 * isso ligar em um banco de verdade.
 */
const EGMPortal = (function () {
  'use strict';

  const WEBHOOK_URL = 'https://n8n.srv1741349.hstgr.cloud/webhook-test/d3e34005-d316-4f79-b976-48910d000e5f';
  const WHATSAPP_NUMBER = '5511942544758';

  function fetchJSON(path) {
    return fetch(path).then((r) => {
      if (!r.ok) throw new Error('Falha ao carregar ' + path);
      return r.json();
    });
  }

  function loadAll() {
    return Promise.all([
      fetchJSON('data/users.json'),
      fetchJSON('data/clientes.json'),
      fetchJSON('data/chamados.json')
    ]).then(([users, clientes, chamados]) => ({ users, clientes, chamados }));
  }

  /* ---------- sessão (via query string, sem storage APIs) ---------- */
  function getSessionUser(users) {
    const id = new URLSearchParams(location.search).get('u');
    if (!id) return null;
    return users.find((u) => u.id === id) || null;
  }

  function loginUrl(targetPage, userId) {
    return `${targetPage}?u=${encodeURIComponent(userId)}`;
  }

  /* ---------- formatação ---------- */
  function currency(n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  function formatDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('pt-BR');
  }
  function formatDateTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const LABELS = {
    status: { ativo: 'Ativo', pausado: 'Pausado', cancelado: 'Cancelado' },
    pagamento: { em_dia: 'Em dia', atrasado: 'Atrasado', cancelado: 'Cancelado' },
    sistemaStatus: { online: 'Online', offline: 'Offline', manutencao: 'Em manutenção' },
    urgencia: { baixa: 'Baixa', media: 'Média', alta: 'Alta' },
    chamadoStatus: { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido' }
  };

  /* ---------- geração determinística de mensagens/dia (mock) ---------- */
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return h;
  }
  function seededRand(seed) {
    // finalizador de hash (baseado no mix de 32 bits do murmur3) — precisa de
    // boa avalanche porque os seeds de dias consecutivos diferem por pouco
    // e um xorshift de passo único não espalha o suficiente.
    let x = (seed || 1) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967295;
  }
  function generateMessageStats(clienteId, days) {
    const base = 30 + (hashStr(clienteId) % 70);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const rnd = seededRand(hashStr(clienteId + dateStr));
      const weekday = d.getDay();
      const weekendFactor = (weekday === 0 || weekday === 6) ? 0.5 : 1;
      const qty = Math.max(0, Math.round((base + rnd * 55 - 20) * weekendFactor));
      out.push({ data: dateStr, quantidade: qty });
    }
    return out;
  }

  /* ---------- tabelas achatadas p/ o console de SQL e relatórios ---------- */
  function buildFlatTables({ clientes, chamados }, messageDays) {
    messageDays = messageDays || 30;
    const clienteNome = (id) => (clientes.find((c) => c.id === id) || {}).nome || id;

    const tClientes = clientes.map((c) => ({
      id: c.id, nome: c.nome, status: c.status, pagamento: c.pagamento,
      planoValorMensal: c.planoValorMensal, inicioContrato: c.inicioContrato
    }));

    const tSistemas = clientes.flatMap((c) => c.sistemas.map((s) => ({
      id: s.id, clienteId: c.id, clienteNome: c.nome, tipo: s.tipo, nome: s.nome,
      status: s.status, ultimaAtualizacao: s.ultimaAtualizacao
    })));

    const tChamados = chamados.map((t) => ({
      id: t.id, clienteId: t.clienteId, clienteNome: clienteNome(t.clienteId),
      titulo: t.titulo, urgencia: t.urgencia, status: t.status, criadoEm: t.criadoEm
    }));

    const tMensagens = clientes.flatMap((c) => generateMessageStats(c.id, messageDays).map((row) => ({
      clienteId: c.id, clienteNome: c.nome, data: row.data, quantidade: row.quantidade
    })));

    return { clientes: tClientes, sistemas: tSistemas, chamados: tChamados, mensagens: tMensagens };
  }

  /* ---------- envio de chamado: webhook n8n + fallback WhatsApp ---------- */
  function buildWhatsAppTicketLink(payload) {
    const text =
`*Chamado EGM* (via site, n8n indisponível)
Cliente: ${payload.cliente}
Título: ${payload.titulo}
Urgência: ${payload.urgencia}
Descrição: ${payload.descricao}
Protocolo local: ${payload.protocolo}`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }

  function generateProtocol() {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `EGM-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${n}`;
  }

  async function submitTicket(payload) {
    // tenta o webhook do n8n primeiro
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('status ' + res.status);
      return { ok: true, channel: 'webhook' };
    } catch (err) {
      // escape hatch: n8n não respondeu (ex: webhook de teste não está "escutando").
      // gera um protocolo local e devolve um link de WhatsApp pronto pra mandar na mão.
      console.warn('EGM: webhook indisponível, caindo pro fallback de WhatsApp.', err);
      return { ok: false, channel: 'whatsapp', link: buildWhatsAppTicketLink(payload) };
    }
  }

  return {
    fetchJSON, loadAll, getSessionUser, loginUrl,
    currency, formatDate, formatDateTime, escapeHtml, LABELS,
    generateMessageStats, buildFlatTables,
    submitTicket, generateProtocol, buildWhatsAppTicketLink,
    WHATSAPP_NUMBER
  };
})();
