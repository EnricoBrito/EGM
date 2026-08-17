/**
 * EGM Portal — mini SQL engine (SELECT only)
 * Suporta: SELECT col1,col2|* FROM tabela [WHERE col OP 'valor'|numero [AND col OP valor]] [ORDER BY col [DESC]] [LIMIT n]
 * OP: = != > < >= <= LIKE
 * Isso NÃO é SQL de verdade — é um mini-interpretador só pra rodar consulta
 * nos arrays em memória (mock) e dar a sensação real de um console de banco.
 */
const EGMSql = (function () {
  'use strict';

  function parse(query) {
    const q = query.trim().replace(/;$/, '');
    const re = /^select\s+(.+?)\s+from\s+(\w+)(?:\s+where\s+(.+?))?(?:\s+order\s+by\s+(\w+)(\s+desc)?)?(?:\s+limit\s+(\d+))?$/i;
    const m = q.match(re);
    if (!m) throw new Error('Não entendi essa consulta. Use algo como: SELECT * FROM clientes WHERE pagamento = \'atrasado\'');
    const [, colsRaw, table, whereRaw, orderCol, orderDesc, limitRaw] = m;
    const cols = colsRaw.trim() === '*' ? null : colsRaw.split(',').map((c) => c.trim());
    const conditions = whereRaw ? whereRaw.split(/\s+and\s+/i).map(parseCondition) : [];
    return { table: table.toLowerCase(), cols, conditions, orderCol, orderDesc: !!orderDesc, limit: limitRaw ? parseInt(limitRaw, 10) : null };
  }

  function parseCondition(part) {
    const m = part.trim().match(/^(\w+)\s*(!=|>=|<=|=|>|<|like)\s*(.+)$/i);
    if (!m) throw new Error(`Condição inválida: "${part}"`);
    let [, col, op, val] = m;
    val = val.trim();
    if (/^'.*'$/.test(val) || /^".*"$/.test(val)) val = val.slice(1, -1);
    else if (!isNaN(Number(val))) val = Number(val);
    return { col, op: op.toLowerCase(), val };
  }

  function matches(row, cond) {
    const cell = row[cond.col];
    if (cell === undefined) throw new Error(`Coluna "${cond.col}" não existe nessa tabela.`);
    switch (cond.op) {
      case '=': return String(cell).toLowerCase() === String(cond.val).toLowerCase();
      case '!=': return String(cell).toLowerCase() !== String(cond.val).toLowerCase();
      case '>': return Number(cell) > Number(cond.val);
      case '<': return Number(cell) < Number(cond.val);
      case '>=': return Number(cell) >= Number(cond.val);
      case '<=': return Number(cell) <= Number(cond.val);
      case 'like': return String(cell).toLowerCase().includes(String(cond.val).toLowerCase());
      default: return false;
    }
  }

  function run(query, tables) {
    const parsed = parse(query);
    const table = tables[parsed.table];
    if (!table) {
      throw new Error(`Tabela "${parsed.table}" não existe. Tabelas disponíveis: ${Object.keys(tables).join(', ')}`);
    }
    let rows = table.filter((row) => parsed.conditions.every((c) => matches(row, c)));
    if (parsed.orderCol) {
      rows = rows.slice().sort((a, b) => {
        const av = a[parsed.orderCol], bv = b[parsed.orderCol];
        if (av === bv) return 0;
        return av > bv ? 1 : -1;
      });
      if (parsed.orderDesc) rows.reverse();
    }
    if (parsed.limit) rows = rows.slice(0, parsed.limit);
    const columns = parsed.cols || (rows[0] ? Object.keys(rows[0]) : (table[0] ? Object.keys(table[0]) : []));
    const outRows = rows.map((r) => columns.map((c) => r[c]));
    return { columns, rows: outRows, count: outRows.length };
  }

  return { run, parse };
})();
